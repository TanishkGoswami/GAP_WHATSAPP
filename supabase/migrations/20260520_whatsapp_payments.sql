-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Create whatsapp_payments table
-- Runs on hub supabase (uklxlappjcuvdqjvecfh)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.whatsapp_payments (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID        NOT NULL,
  razorpay_payment_link_id  TEXT        UNIQUE,
  plan                      TEXT        NOT NULL,  -- "WhatsApp Pro" / "WhatsApp Premium"
  plan_id                   TEXT,                  -- raw planId: "whatsapp_pro" / "whatsapp_premium"
  amount                    BIGINT      NOT NULL,  -- in paise
  interval_months           INT         DEFAULT 1,
  status                    TEXT        NOT NULL DEFAULT 'pending',
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_payments_user_id
  ON public.whatsapp_payments (user_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_payments_status
  ON public.whatsapp_payments (status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_payments_link_id
  ON public.whatsapp_payments (razorpay_payment_link_id);

ALTER TABLE public.whatsapp_payments ENABLE ROW LEVEL SECURITY;

-- Users can read their own payments
CREATE POLICY "Users can view own whatsapp payments"
  ON public.whatsapp_payments FOR SELECT
  USING (auth.uid() = user_id);

SELECT 'whatsapp_payments table created ✅' AS status;
