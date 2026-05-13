import { sendEmail } from './email';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    try {
        const loginLink = `http://localhost:5173/login`;
        const email = 'anuragverma1632004@gmail.com';
        const password = 'TestPassword123';
        const name = 'Anurag Agent';
        const role = 'agent';

        await sendEmail(
            email,
            'Invitation to join FlowsApp Team',
            `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                    <h2 style="color: #25D366;">You've been invited!</h2>
                    <p>Hello <strong>${name}</strong>,</p>
                    <p>You have been invited to join the <strong>FlowsApp</strong> team as an <strong>${role}</strong>.</p>
                    <p>As a team member, you'll be able to manage WhatsApp chats and help automate customer interactions.</p>
                    
                    <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <h3 style="margin-top: 0;">Your Login Credentials:</h3>
                        <p><strong>Login URL:</strong> <a href="${loginLink}">${loginLink}</a></p>
                        <p><strong>Email ID:</strong> ${email}</p>
                        <p><strong>Password:</strong> ${password}</p>
                    </div>

                    <div style="margin: 30px 0;">
                        <a href="${loginLink}" style="background-color: #25D366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Go to Login Page</a>
                    </div>
                    <p style="color: #666; font-size: 14px;">If you already have an account, your existing password will continue to work.</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="color: #999; font-size: 12px;">This invitation was sent from the FlowsApp Dashboard.</p>
                </div>
                `
        );
        console.log('Test execution finished.');
    } catch (e) {
        console.error('Test failed', e);
    }
}

test();
