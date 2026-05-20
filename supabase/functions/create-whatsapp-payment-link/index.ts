// create-whatsapp-payment-link/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Pricing in paise (INR × 100)
const PRICING: Record<string, Record<number, number>> = {
  whatsapp_pro:     { 1: 159900, 3: 139900, 6: 129900 },
  whatsapp_premium: { 1: 299900, 3: 269900, 6: 249900 },
};

const PLAN_LABELS: Record<string, string> = {
  whatsapp_pro:     "WhatsApp Pro",
  whatsapp_premium: "WhatsApp Premium",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { planId, interval = 1, userId, customerName, customerEmail, customerContact } = await req.json();

    if (!userId || !planId) throw new Error("userId and planId are required");
    if (!PRICING[planId]) throw new Error(`Invalid planId: ${planId}`);

    const priceMap = PRICING[planId];
    const amount = priceMap[interval] ?? priceMap[1];
    const planLabel = PLAN_LABELS[planId];
    const description = `${planLabel} Subscription (${interval} Month${interval > 1 ? "s" : ""})`;

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const razorpayResponse = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount,
        currency: "INR",
        accept_partial: false,
        description,
        customer: {
          name:    customerName || "Customer",
          email:   customerEmail,
          contact: customerContact,
        },
        notify:          { sms: false, email: true },
        reminder_enable: true,
        notes: {
          user_id:  userId,
          plan:     planId,
          interval: interval.toString(),
          product:  "whatsapp",
        },
        callback_url:    `${req.headers.get("origin") || "https://wb.getaipilot.in"}/payment-success`,
        callback_method: "get",
      }),
    });

    const razorpayData = await razorpayResponse.json();
    if (!razorpayResponse.ok) {
      throw new Error(razorpayData.error?.description || "Failed to create Razorpay payment link");
    }

    // Store in whatsapp_payments table
    await supabase.from("whatsapp_payments").insert({
      user_id:                  userId,
      razorpay_payment_link_id: razorpayData.id,
      plan:                     planLabel,
      plan_id:                  planId,
      amount,
      interval_months:          interval,
      status:                   "pending",
    }).then(({ error }) => {
      if (error) console.error("DB insert error:", error.message);
    });

    return new Response(
      JSON.stringify({ success: true, payment_link: razorpayData.short_url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[create-whatsapp-payment-link] Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
