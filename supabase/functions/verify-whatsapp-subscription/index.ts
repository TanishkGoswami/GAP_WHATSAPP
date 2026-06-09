// verify-whatsapp-subscription/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL           = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getPlanName(planId: string): string {
  if (!planId) return "Growth";
  const p = planId.toLowerCase();
  if (p.includes("starter")) return "Starter";
  if (p.includes("growth")) return "Growth";
  if (p === "pro" || p.includes("whatsapp_pro")) return "Pro";
  if (p.includes("premium")) return "Pro";
  if (p.includes("all_in_one") || p.includes("ultimate")) return "GAP Ultimate Ecosystem";
  return "Growth";
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function getRazorpayCredentialPairs() {
  const mode = (Deno.env.get("RAZORPAY_MODE") || "live").toLowerCase();
  const pairs = [
    {
      label: "live",
      keyId: Deno.env.get("RAZORPAY_LIVE_KEY_ID"),
      keySecret: Deno.env.get("RAZORPAY_LIVE_KEY_SECRET"),
    },
    {
      label: "test",
      keyId: Deno.env.get("RAZORPAY_TEST_KEY_ID"),
      keySecret: Deno.env.get("RAZORPAY_TEST_KEY_SECRET"),
    },
    {
      label: "default",
      keyId: Deno.env.get("RAZORPAY_KEY_ID"),
      keySecret: Deno.env.get("RAZORPAY_KEY_SECRET"),
    },
  ].filter((pair) => pair.keyId && pair.keySecret);

  if (mode === "test") return pairs.sort((a, b) => Number(b.label === "test") - Number(a.label === "test"));
  if (mode === "live") return pairs.sort((a, b) => Number(b.label === "live") - Number(a.label === "live"));
  return pairs;
}

async function fetchRazorpayPaymentLink(paymentLinkId: string) {
  const credentialPairs = getRazorpayCredentialPairs();
  if (!credentialPairs.length) throw new Error("Razorpay is not configured");

  let lastError = "Failed to fetch Razorpay status";
  for (const pair of credentialPairs) {
    const auth = btoa(`${pair.keyId}:${pair.keySecret}`);
    const response = await fetch(
      `https://api.razorpay.com/v1/payment_links/${paymentLinkId}`,
      { headers: { "Authorization": `Basic ${auth}` } },
    );
    const data = await response.json();
    if (response.ok) return data;

    lastError = data.error?.description || data.error?.reason || lastError;
    const canTryNextPair = /auth/i.test(lastError) || /does not exist/i.test(lastError);
    if (!canTryNextPair) throw new Error(lastError);
    console.warn(`[verify-whatsapp-subscription] Razorpay ${pair.label} credentials could not read this link: ${lastError}`);
  }

  throw new Error(lastError);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { razorpayPaymentLinkId } = await req.json();
    if (!razorpayPaymentLinkId) throw new Error("razorpayPaymentLinkId is required");

    // 1. Fetch payment status from Razorpay
    const rzpData = await fetchRazorpayPaymentLink(razorpayPaymentLinkId);

    const status = rzpData.status;
    const userId = rzpData.notes?.user_id;
    const planId = rzpData.notes?.plan;
    const intervalMonths = Number(rzpData.notes?.interval || 1);

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // 2. Update whatsapp_payments table
    await supabase
      .from("whatsapp_payments")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("razorpay_payment_link_id", razorpayPaymentLinkId);

    if (status === "paid" && userId && planId) {
      const planName = getPlanName(planId);
      const now = new Date();
      const months = Number.isFinite(intervalMonths) && intervalMonths > 0 ? intervalMonths : 1;
      const expiresAt = addMonths(now, months);
      const amount = Number(rzpData.amount || 0);

      // 3. Update auth user_metadata
      const { error: authErr } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { plan: planName, subscription_status: "active" },
      });
      if (authErr) throw new Error("Payment verified but failed to update user plan. Contact support.");

      // 4. Get user email
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      const email = authUser?.user?.email;
      const organizationId = authUser?.user?.user_metadata?.organization_id;

      const { error: subErr } = await supabase
        .from("app_user_subscriptions")
        .upsert(
          {
            user_id: userId,
            plan_id: planId,
            plan_label: planName,
            plan_price_paise: amount,
            plan_duration_days: months * 30,
            last_payment_id: razorpayPaymentLinkId,
            last_payment_status: status,
            last_payment_verified_at: now.toISOString(),
            started_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            updated_at: now.toISOString(),
            total_cycles: months,
            raw: rzpData,
          },
          { onConflict: "user_id" }
        );
      if (subErr) console.warn("app_user_subscriptions upsert error:", subErr.message);

      if (organizationId) {
        const { error: orgErr } = await supabase
          .from("organizations")
          .update({
            plan_id: planId,
            plan_status: "active",
            plan_start_date: now.toISOString(),
            plan_end_date: expiresAt.toISOString(),
            billing_cycle: months >= 12 ? "yearly" : "monthly",
            updated_at: now.toISOString(),
          })
          .eq("id", organizationId);
        if (orgErr) console.warn("organizations plan update error:", orgErr.message);
      }

      // 5. Upsert hub_subscriptions (this IS the hub DB — same project)
      if (email) {
        const { error: hubErr } = await supabase
          .from("hub_subscriptions")
          .upsert(
            {
              email,
              plan:                planName,
              plan_id:             planId,
              subscription_status: "active",
              updated_at:          new Date().toISOString(),
              synced_at:           new Date().toISOString(),
            },
            { onConflict: "email" }
          );
        if (hubErr) console.warn("hub_subscriptions upsert error:", hubErr.message);
        else console.log(`[verify-whatsapp] ✅ ${email} → ${planName}`);
      }

      return new Response(
        JSON.stringify({ success: true, status, plan: planName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[verify-whatsapp-subscription] Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
