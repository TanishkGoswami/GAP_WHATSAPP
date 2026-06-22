import { Response } from 'express';
import { supabase } from '../config/supabase.js';
import { 
    DEFAULT_WHATSAPP_RATE_CARD, 
    DEFAULT_BILLING_MARKET, 
    DEFAULT_BILLING_CURRENCY 
} from '../utils/billing.js';

export const getBillingOverview = async (req: any, res: Response) => {
    const orgId = req.organization_id;
    const userId = req.user?.id;
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

    const fallbackRateCards = Object.values(DEFAULT_WHATSAPP_RATE_CARD).map(rate => ({
        market: DEFAULT_BILLING_MARKET,
        currency: DEFAULT_BILLING_CURRENCY,
        category: rate.category,
        label: rate.label,
        rate_paise: rate.rate_paise,
        pass_through_rate_paise: rate.rate_paise,
        markup_paise: 0,
        description: rate.description,
        notes: 'Fallback rate. Run the billing migration to manage rates from Supabase.'
    }));

    try {
        if (!orgId) return res.status(400).json({ error: 'organization_id is required' });

        const [
            orgResult,
            plansResult,
            walletResult,
            rateCardsResult,
            monthUsageResult,
            todayUsageResult,
            walletTransactionsResult,
            messageDebitTransactionsResult,
            messageChargesResult,
            legacyMonthSpendResult,
            legacyTodaySpendResult
        ] = await Promise.all([
            supabase
                .from('organizations')
                .select('id, name, plan_id, plan_status, plan_start_date, plan_end_date, billing_cycle, max_users, max_contacts')
                .eq('id', orgId)
                .maybeSingle(),
            supabase
                .from('whatsapp_subscription_plans')
                .select('*')
                .eq('is_active', true)
                .order('sort_order', { ascending: true }),
            supabase
                .from('whatsapp_wallets')
                .select('*')
                .eq('organization_id', orgId)
                .maybeSingle(),
            supabase
                .from('whatsapp_rate_cards')
                .select('market, currency, category, rate_paise, pass_through_rate_paise, markup_paise, notes, effective_from')
                .eq('market', DEFAULT_BILLING_MARKET)
                .eq('currency', DEFAULT_BILLING_CURRENCY)
                .eq('is_active', true)
                .order('effective_from', { ascending: false }),
            supabase
                .from('whatsapp_message_usage_logs')
                .select('category, charged_amount_paise, meta_cost_paise, billable, billing_status')
                .eq('organization_id', orgId)
                .gte('created_at', monthStart),
            supabase
                .from('whatsapp_message_usage_logs')
                .select('category, charged_amount_paise')
                .eq('organization_id', orgId)
                .gte('created_at', todayStart),
            supabase
                .from('whatsapp_wallet_transactions')
                .select('id, type, amount_paise, balance_after_paise, currency, status, description, reference_type, reference_id, created_at')
                .eq('organization_id', orgId)
                .filter('type', 'not.in', '("message_debit","failed_debit")')
                .order('created_at', { ascending: false })
                .limit(20),
            supabase
                .from('whatsapp_wallet_transactions')
                .select('id, type, amount_paise, balance_after_paise, currency, status, description, reference_type, reference_id, created_at, metadata')
                .eq('organization_id', orgId)
                .filter('type', 'in', '("message_debit","failed_debit")')
                .order('created_at', { ascending: false })
                .limit(20),
            supabase
                .from('whatsapp_message_usage_logs')
                .select('id, source, category, template_name, campaign_id, wa_message_id, charged_amount_paise, billing_status, delivery_status, created_at')
                .eq('organization_id', orgId)
                .order('created_at', { ascending: false })
                .limit(12),
            supabase
                .from('whatsapp_wallet_transactions')
                .select('amount_paise, metadata')
                .eq('organization_id', orgId)
                .filter('type', 'in', '("message_debit","failed_debit")')
                .gte('created_at', monthStart),
            supabase
                .from('whatsapp_wallet_transactions')
                .select('amount_paise')
                .eq('organization_id', orgId)
                .filter('type', 'in', '("message_debit","failed_debit")')
                .gte('created_at', todayStart)
        ]);

        let walletData = walletResult.data;
        if (!walletData && !walletResult.error && userId) {
            const { data: createdWallet, error: createWalletError } = await supabase
                .from('whatsapp_wallets')
                .insert({ organization_id: orgId, currency: DEFAULT_BILLING_CURRENCY })
                .select()
                .maybeSingle();
            if (!createWalletError && createdWallet) walletData = createdWallet;
        }

        const plans = plansResult.error ? [] : (plansResult.data || []);
        const rateCardsFromDb = rateCardsResult.error
            ? fallbackRateCards
            : (rateCardsResult.data || []).reduce((acc: any[], row: any) => {
                if (!acc.some(item => item.category === row.category)) {
                    acc.push({
                        ...row,
                        label: DEFAULT_WHATSAPP_RATE_CARD[row.category]?.label || row.category,
                        description: DEFAULT_WHATSAPP_RATE_CARD[row.category]?.description || ''
                    });
                }
                return acc;
            }, []);

        const rateCards = rateCardsFromDb.length ? rateCardsFromDb : fallbackRateCards;
        const monthUsageRows = monthUsageResult.error ? [] : (monthUsageResult.data || []);
        const todayUsageRows = todayUsageResult.error ? [] : (todayUsageResult.data || []);

        const emptyCategoryStats = Object.keys(DEFAULT_WHATSAPP_RATE_CARD).reduce((acc: any, category) => {
            acc[category] = {
                category,
                label: DEFAULT_WHATSAPP_RATE_CARD[category].label,
                message_count: 0,
                charged_amount_paise: 0,
                meta_cost_paise: 0
            };
            return acc;
        }, {});

        const categoryStats = monthUsageRows.reduce((acc: any, row: any) => {
            const category = row.category || 'service';
            if (!acc[category]) {
                acc[category] = {
                    category,
                    label: DEFAULT_WHATSAPP_RATE_CARD[category]?.label || category,
                    message_count: 0,
                    charged_amount_paise: 0,
                    meta_cost_paise: 0
                };
            }
            acc[category].message_count += 1;
            acc[category].charged_amount_paise += Number(row.charged_amount_paise || 0);
            acc[category].meta_cost_paise += Number(row.meta_cost_paise || 0);
            return acc;
        }, emptyCategoryStats);

        // Include legacy wallet transactions in category stats
        const legacyMonthRows = legacyMonthSpendResult.error ? [] : (legacyMonthSpendResult.data || []);
        legacyMonthRows.forEach((row: any) => {
            const category = row.metadata?.category || 'marketing';
            if (!categoryStats[category]) {
                categoryStats[category] = {
                    category,
                    label: DEFAULT_WHATSAPP_RATE_CARD[category]?.label || category,
                    message_count: 0,
                    charged_amount_paise: 0,
                    meta_cost_paise: 0
                };
            }
            categoryStats[category].message_count += 1;
            categoryStats[category].charged_amount_paise += Math.abs(Number(row.amount_paise || 0));
        });

        const monthSpendPaise = Object.values(categoryStats).reduce((sum: number, item: any) => sum + Number(item.charged_amount_paise || 0), 0);
        
        const legacyTodayRows = legacyTodaySpendResult.error ? [] : (legacyTodaySpendResult.data || []);
        const legacyTodaySpend = legacyTodayRows.reduce((sum: number, row: any) => sum + Math.abs(Number(row.amount_paise || 0)), 0);
        const todaySpendPaise = todayUsageRows.reduce((sum: number, row: any) => sum + Number(row.charged_amount_paise || 0), 0) + legacyTodaySpend;
        const walletTransactions = walletTransactionsResult.error ? [] : (walletTransactionsResult.data || []);
        const usageLogCharges = messageChargesResult.error ? [] : (messageChargesResult.data || []);
        const legacyMessageDebitCharges = messageDebitTransactionsResult.error
            ? []
            : (messageDebitTransactionsResult.data || []).map((tx: any) => ({
                id: tx.id,
                source: tx.reference_type || 'message',
                category: tx.metadata?.category || null,
                template_name: tx.metadata?.template_name || null,
                campaign_id: tx.metadata?.campaign_id || (tx.reference_type === 'broadcast' ? tx.reference_id : null),
                wa_message_id: tx.reference_id || null,
                charged_amount_paise: Math.abs(Number(tx.amount_paise || 0)),
                billing_status: tx.status === 'completed' ? 'charged' : tx.status,
                delivery_status: null,
                created_at: tx.created_at,
            }));
        const messageCharges = usageLogCharges.length ? usageLogCharges : legacyMessageDebitCharges;

        const orgData = orgResult.data ? { ...orgResult.data } : { id: orgId, plan_id: null, plan_status: 'inactive' };
        try {
            if (orgResult.data) {
                const { data: ownerMember } = await supabase
                    .from('organization_members')
                    .select('user_id')
                    .eq('organization_id', orgId)
                    .eq('role', 'owner')
                    .maybeSingle();

                if (ownerMember?.user_id) {
                    const { data: sub } = await supabase
                        .from('app_user_subscriptions')
                        .select('started_at, expires_at')
                        .eq('user_id', ownerMember.user_id)
                        .maybeSingle();

                    if (sub) {
                        if (!orgData.plan_start_date) orgData.plan_start_date = sub.started_at;
                        if (!orgData.plan_end_date) orgData.plan_end_date = sub.expires_at;
                    }
                }
            }
        } catch (subErr) {
            console.error('[billing/overview] Failed to fetch owner subscription dates:', subErr);
        }

        const planId = orgData.plan_id || null;
        const currentPlan = planId ? plans.find((plan: any) => plan.id === planId) || null : null;

        res.json({
            organization: orgData,
            current_plan: currentPlan,
            plans,
            wallet: walletData || {
                organization_id: orgId,
                balance_paise: 0,
                currency: DEFAULT_BILLING_CURRENCY,
                low_balance_threshold_paise: 10000
            },
            spend: {
                month_start: monthStart,
                today_start: todayStart,
                month_spend_paise: monthSpendPaise,
                today_spend_paise: todaySpendPaise,
                categories: Object.values(categoryStats)
            },
            rate_cards: rateCards,
            recent_transactions: walletTransactions,
            recent_wallet_transactions: walletTransactions,
            recent_message_charges: messageCharges,
            warnings: {
                plans_table_missing: !!plansResult.error,
                wallet_table_missing: !!walletResult.error,
                usage_table_missing: !!monthUsageResult.error,
                rate_card_table_missing: !!rateCardsResult.error
            }
        });
    } catch (err: any) {
        console.error('[billing/overview] Error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch billing overview' });
    }
};

export const getWallet = async (req: any, res: Response) => {
  const orgId = req.organization_id;
  try {
    const { data: wallet, error } = await supabase
      .from('whatsapp_wallets')
      .select('balance_paise, currency')
      .eq('organization_id', orgId)
      .maybeSingle();

    if (error) throw error;

    res.json({
      wallet: wallet || { balance_paise: 0, currency: "INR" }
    });
  } catch (err: any) {
    console.error('Error fetching wallet:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch wallet' });
  }
};

export const getNotifications = async (req: any, res: Response) => {
  const orgId = req.organization_id;
  try {
    if (!orgId) {
      return res.status(400).json({ error: 'organization_id is required' });
    }

    const { data: transactions, error } = await supabase
      .from('whatsapp_wallet_transactions')
      .select('id, type, amount_paise, status, description, created_at')
      .eq('organization_id', orgId)
      .eq('type', 'recharge')
      .order('created_at', { ascending: false })
      .limit(15);

    if (error) throw error;

    const notifications = (transactions || []).map((t: any) => {
      const amountRupees = (t.amount_paise / 100).toFixed(2);
      let type = 'info';
      let title = 'Payment Update';
      let message = t.description || `Wallet transaction of ₹${amountRupees}`;

      if (t.status === 'completed') {
        type = 'success';
        title = 'Payment Successful';
        message = `Your wallet recharge of ₹${amountRupees} was completed successfully.`;
      } else if (t.status === 'failed') {
        type = 'error';
        title = 'Payment Failed';
        message = `Your wallet recharge of ₹${amountRupees} failed. Please try again.`;
      } else if (t.status === 'pending') {
        type = 'warning';
        title = 'Payment Pending';
        message = `Your wallet recharge of ₹${amountRupees} is currently pending.`;
      } else if (t.status === 'cancelled') {
        type = 'warning';
        title = 'Payment Cancelled';
        message = `Your wallet recharge of ₹${amountRupees} was cancelled.`;
      }

      return {
        id: t.id,
        type,
        title,
        message,
        time: t.created_at,
        link: '/billing'
      };
    });

    res.json({ notifications });
  } catch (err: any) {
    console.error('[billing/notifications] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch notifications' });
  }
};
