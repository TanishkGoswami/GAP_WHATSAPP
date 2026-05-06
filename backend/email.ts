import nodemailer from 'nodemailer';

const transporterConfig: any = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
};

// If using gmail, 'service' option is more reliable
if (process.env.SMTP_HOST?.includes('gmail')) {
    delete transporterConfig.host;
    delete transporterConfig.port;
    delete transporterConfig.secure;
    transporterConfig.service = 'gmail';
}

const transporter = nodemailer.createTransport(transporterConfig);

export async function sendEmail(to: string, subject: string, html: string) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('⚠️ SMTP credentials not set. Skipping email send.');
        return;
    }

    try {
        const info = await transporter.sendMail({
            from: `"${process.env.SMTP_FROM_NAME || 'FlowsApp'}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
            to,
            subject,
            html,
        });
        console.log('✉️ Email sent: %s', info.messageId);
        return info;
    } catch (error) {
        console.error('❌ Failed to send email:', error);
        throw error;
    }
}
