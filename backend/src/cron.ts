import cron from "node-cron";
import { supabase } from './config/supabase.js';
import { processCampaign } from './services/broadcast.service.js';

export function startCronJobs() {
    if (process.env.BROADCAST_QUEUE_ENABLED === 'true') {
        console.log('[broadcast] Legacy campaign cron disabled; BullMQ owns scheduling and recovery');
        return;
    }
    // Process scheduled campaigns every minute
    cron.schedule('* * * * *', async () => {
        try {
            const { data: campaigns, error } = await supabase
                .from('w_campaigns')
                .select('*')
                .eq('status', 'scheduled')
                .lte('scheduled_at', new Date().toISOString());

            if (error || !campaigns) return;

            for (const camp of campaigns) {
                processCampaign(camp).catch(err => console.error('Cron processCampaign error:', err));
            }
        } catch (e) {
            console.error('Campaign cron error:', e);
        }
    });

    // Also pick up any stuck "processing" campaigns periodically (every 5 mins)
    cron.schedule('*/5 * * * *', async () => {
        try {
            const { data: stuckCampaigns, error } = await supabase
                .from('w_campaigns')
                .select('*')
                .eq('status', 'processing')
                // Wait at least 5 minutes before considering it stuck
                .lte('created_at', new Date(Date.now() - 5 * 60000).toISOString());

            if (error || !stuckCampaigns) return;

            for (const camp of stuckCampaigns) {
                processCampaign(camp).catch(err => console.error('Stuck campaign recovery error:', err));
            }
        } catch (e) {
            console.error('Stuck campaign cron error:', e);
        }
    });

    console.log('✅ Cron jobs started');
}
