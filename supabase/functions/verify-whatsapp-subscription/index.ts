// verify-whatsapp-subscription/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RAZORPAY_KEY_ID        = Deno.env.get("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET    = Deno.env.get("RAZORPAY_KEY_SECRET");
const SUPABASE_URL           = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getPlanName(planId: string): string {
  if (!planId) return "WhatsApp Pro";
  const p = planId.toLowerCase();
  if (p.includes("premium"))       return "WhatsApp Premium";
  if (p.includes("all_in_one") || p.includes("ultimate")) return "GAP Ultimate Ecosystem";
  return "WhatsApp Pro";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { razorpayPaymentLinkId } = await req.json();
    if (!razorpayPaymentLinkId) throw new Error("razorpayPaymentLinkId is required");

    // 1. Fetch payment status from Razorpay
    const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const rzpRes = await fetch(
      `https://api.razorpay.com/v1/payment_links/${razorpayPaymentLinkId}`,
      { headers: { "Authorization": `Basic ${auth}` } }
    );
    const rzpData = await rzpRes.json();
    if (!rzpRes.ok) throw new Error(rzpData.error?.description || "Failed to fetch Razorpay status");

    const status = rzpData.status;
    const userId = rzpData.notes?.user_id;
    const planId = rzpData.notes?.plan;

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // 2. Update whatsapp_payments table
    await supabase
      .from("whatsapp_payments")
      .update({ status })
      .eq("razorpay_payment_link_id", razorpayPaymentLinkId);

    if (status === "paid" && userId && planId) {
      const planName = getPlanName(planId);

      // 3. Update auth user_metadata
      const { error: authErr } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { plan: planName, subscription_status: "active" },
      });
      if (authErr) throw new Error("Payment verified but failed to update user plan. Contact support.");

      // 4. Get user email
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      const email = authUser?.user?.email;

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
