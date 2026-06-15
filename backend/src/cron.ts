
import cron from "node-cron";
import { supabase } from '../config/supabase.js';
import { processCampaign } from '../services/broadcast.service.js';
import { processBillingSubscriptions } from '../services/billing.service.js';
import { processWhatsAppMessageCharges } from '../services/billing.service.js';

export function startCronJobs() {

}
