import crypto from 'crypto';
import { sendEmail } from '../../email.js';

const INVITE_TTL_HOURS = 24;

export function createInviteToken() {
    return crypto.randomBytes(32).toString('base64url');
}

export function hashInviteToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export function createTemporaryPassword() {
    return `Flow-${crypto.randomBytes(6).toString('base64url')}`;
}

export function getInviteExpiryDate() {
    return new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);
}

export function getFrontendBaseUrl() {
    return process.env.FRONTEND_URL || 'http://localhost:3000';
}

export function getMemberInviteState(member: any) {
    if (member?.invite_accepted_at || member?.is_active) return 'active';
    const expiresAt = member?.invite_expires_at ? new Date(member.invite_expires_at) : null;
    if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) return 'expired';
    return 'pending';
}

export async function sendTeamInviteEmail(params: {
    email: string;
    name: string;
    role: string;
    password: string;
    inviteLink: string;
    expiresAt: Date;
}) {
    const roleLabel = String(params.role || 'agent').charAt(0).toUpperCase() + String(params.role || 'agent').slice(1);
    const expiresLabel = params.expiresAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    await sendEmail(
        params.email,
        `Invitation to join GAP FlowPilot Team`,
        `
        <div style="margin:0; padding:0; background:#f5f7fa;">
            <div style="font-family:Arial,Helvetica,sans-serif; max-width:640px; margin:0 auto; padding:32px 20px;">
                <div style="background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
                    <div style="padding:28px 32px 22px 32px; border-bottom:1px solid #eef2f7;">
                        <div style="display:inline-block; padding:6px 10px; border-radius:999px; background:#e9fbf1; color:#128C7E; font-size:12px; font-weight:700; line-height:1;">
                            GAP FlowPilot invitation
                        </div>
                        <h1 style="margin:18px 0 8px 0; color:#111827; font-size:28px; line-height:1.25; font-weight:500;">
                            You have been invited to join the team
                        </h1>
                        <p style="margin:0; color:#4b5563; font-size:15px; line-height:1.6;">
                            Hello <strong style="color:#111827;">${params.name}</strong>, your workspace owner invited you as a <strong style="color:#111827;">${roleLabel}</strong>.
                        </p>
                    </div>
                    <div style="padding:28px 32px;">
                        <p style="margin:0 0 16px 0; color:#4b5563; font-size:15px; line-height:1.6;">
                            Your temporary login credentials are:
                        </p>
                        <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-bottom:24px;">
                            <div style="margin-bottom:8px;">
                                <span style="color:#6b7280; font-size:13px; text-transform:uppercase; letter-spacing:0.05em;">Email</span><br/>
                                <strong style="color:#111827; font-size:15px;">${params.email}</strong>
                            </div>
                            <div>
                                <span style="color:#6b7280; font-size:13px; text-transform:uppercase; letter-spacing:0.05em;">Temporary Password</span><br/>
                                <strong style="color:#111827; font-size:15px;">${params.password}</strong>
                            </div>
                        </div>
                        <a href="${params.inviteLink}" style="display:inline-block; background:#128C7E; color:#ffffff; font-weight:500; font-size:15px; text-decoration:none; padding:12px 24px; border-radius:6px;">
                            Accept Invitation
                        </a>
                        <p style="margin:24px 0 0 0; color:#6b7280; font-size:13px; line-height:1.5;">
                            This link expires on <strong>${expiresLabel}</strong>. For security, please change your password after logging in.
                        </p>
                    </div>
                </div>
            </div>
        </div>
        `
    );
}
