import { Response } from 'express';
import { supabase } from '../config/supabase.js';
import { enforcePlanResourceLimit } from '../services/billing.service.js';
import { encryptToken, decryptToken } from '../utils/crypto.js';
import { 
    createInviteToken, 
    hashInviteToken, 
    createTemporaryPassword, 
    getInviteExpiryDate, 
    getFrontendBaseUrl, 
    getMemberInviteState, 
    sendTeamInviteEmail 
} from '../utils/team.js';

export async function getMembers(req: any, res: Response) {
    const orgId = req.organization_id;
    try {
        const { data, error } = await supabase
            .from('organization_members')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        res.json((data || []).map((member: any) => ({
            ...member,
            invite_status: getMemberInviteState(member)
        })));
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function inviteMember(req: any, res: Response) {
    const orgId = req.organization_id;
    const { email, name, role, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !name || !password) return res.status(400).json({ error: 'Email, name and password are required' });

    try {
        const inviteToken = createInviteToken();
        const inviteExpiresAt = getInviteExpiryDate();
        const temporaryPassword = password || createTemporaryPassword();

        const { data: existing } = await supabase
            .from('organization_members')
            .select('*')
            .eq('organization_id', orgId)
            .ilike('email', normalizedEmail)
            .maybeSingle();

        if (!existing?.id) {
            await enforcePlanResourceLimit({
                organization_id: orgId,
                resource: 'agents',
                table: 'organization_members',
                filters: { role: ['agent', 'admin'] },
                label: 'Team member',
            });
        }

        let userId: string;
        if (existing?.user_id) {
            userId = existing.user_id;
            const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
                password: temporaryPassword,
                email_confirm: true,
                user_metadata: { organization_id: orgId, role: role || 'agent', name }
            });
            if (updateErr) throw updateErr;
        } else {
            const { data: inviteData, error: inviteErr } = await supabase.auth.admin.createUser({
                email: normalizedEmail,
                password: temporaryPassword,
                email_confirm: true,
                user_metadata: { organization_id: orgId, role, name }
            });

            if (inviteErr) {
                if (inviteErr.message.includes('already been registered') || inviteErr.status === 422) {
                    let page = 1;
                    let existingUser;
                    while (true) {
                        const { data: users, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
                        if (listErr) throw listErr;
                        if (!users?.users?.length) break;

                        existingUser = users.users.find((u: any) => u.email?.toLowerCase() === normalizedEmail);
                        if (existingUser) break;

                        if (users.users.length < 1000) break;
                        page++;
                    }

                    if (!existingUser) throw new Error('User already registered but could not be found');
                    userId = existingUser.id;

                    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
                        password: temporaryPassword,
                        email_confirm: true,
                        user_metadata: {
                            ...(existingUser.user_metadata || {}),
                            organization_id: orgId,
                            role: role || 'agent',
                            name
                        }
                    });
                    if (updateErr) throw updateErr;
                } else {
                    throw inviteErr;
                }
            } else {
                userId = inviteData.user.id;
            }
        }

        const memberPayload = {
            organization_id: orgId,
            user_id: userId,
            email: normalizedEmail,
            name,
            role: role || 'agent',
            is_active: false,
            invite_token_hash: hashInviteToken(inviteToken),
            invite_expires_at: inviteExpiresAt.toISOString(),
            invite_sent_at: new Date().toISOString(),
            invite_accepted_at: null,
            invite_temp_password_encrypted: encryptToken(temporaryPassword)
        };

        const memberQuery = existing?.id
            ? supabase.from('organization_members').update(memberPayload).eq('id', existing.id).eq('organization_id', orgId)
            : supabase.from('organization_members').insert(memberPayload);

        const { error: insertErr } = await memberQuery;

        if (insertErr) throw insertErr;

        try {
            const inviteLink = `${getFrontendBaseUrl()}/accept-invite?token=${encodeURIComponent(inviteToken)}`;
            await sendTeamInviteEmail({
                email: normalizedEmail,
                name,
                role: role || 'agent',
                password: temporaryPassword,
                inviteLink,
                expiresAt: inviteExpiresAt
            });
        } catch (mailErr) {
            console.error("Failed to send invitation email:", mailErr);
        }

        res.json({ success: true, message: 'Member invited successfully and email sent', expires_at: inviteExpiresAt.toISOString() });
    } catch (err: any) {
        res.status(err.statusCode || 500).json({ error: err.message, limit: err.limit });
    }
}

export async function acceptInvite(req: any, res: Response) {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Invitation token is required' });

    try {
        const tokenHash = hashInviteToken(String(token));
        const { data: member, error } = await supabase
            .from('organization_members')
            .select('*')
            .eq('invite_token_hash', tokenHash)
            .maybeSingle();

        if (error) throw error;
        if (!member) return res.status(404).json({ error: 'Invitation link is invalid or has already been used' });
        if (member.invite_accepted_at) return res.status(409).json({ error: 'Invitation has already been accepted' });

        const expiresAt = member.invite_expires_at ? new Date(member.invite_expires_at) : null;
        if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
            await supabase.from('organization_members').update({ is_active: false }).eq('id', member.id);
            return res.status(410).json({ error: 'Invitation link has expired. Please ask your admin to resend it.' });
        }

        const temporaryPassword = member.invite_temp_password_encrypted
            ? decryptToken(member.invite_temp_password_encrypted)
            : null;

        if (!temporaryPassword) {
            return res.status(400).json({ error: 'Invitation is missing login credentials. Please ask your admin to resend it.' });
        }

        const { error: updateErr } = await supabase
            .from('organization_members')
            .update({
                is_active: true,
                invite_accepted_at: new Date().toISOString(),
                invite_token_hash: null,
                invite_temp_password_encrypted: null
            })
            .eq('id', member.id);

        if (updateErr) throw updateErr;

        res.json({
            success: true,
            email: member.email,
            password: temporaryPassword,
            role: member.role || 'agent'
        });
    } catch (err: any) {
        console.error('Accept invitation error:', err);
        res.status(500).json({ error: err.message || 'Failed to accept invitation' });
    }
}

export async function resendInvite(req: any, res: Response) {
    const orgId = req.organization_id;
    const { id } = req.params;

    try {
        const { data: member, error: memberErr } = await supabase
            .from('organization_members')
            .select('*')
            .eq('id', id)
            .eq('organization_id', orgId)
            .maybeSingle();

        if (memberErr) throw memberErr;
        if (!member) return res.status(404).json({ error: 'Member not found' });
        if (member.role === 'owner') return res.status(400).json({ error: 'Owner invitations cannot be resent' });
        if (getMemberInviteState(member) === 'active') return res.status(400).json({ error: 'This member is already active' });

        const inviteToken = createInviteToken();
        const inviteExpiresAt = getInviteExpiryDate();
        const temporaryPassword = createTemporaryPassword();

        const { error: authErr } = await supabase.auth.admin.updateUserById(member.user_id, {
            password: temporaryPassword,
            email_confirm: true,
            user_metadata: {
                organization_id: orgId,
                role: member.role || 'agent',
                name: member.name
            }
        });
        if (authErr) throw authErr;

        const { error: updateErr } = await supabase
            .from('organization_members')
            .update({
                is_active: false,
                invite_token_hash: hashInviteToken(inviteToken),
                invite_expires_at: inviteExpiresAt.toISOString(),
                invite_sent_at: new Date().toISOString(),
                invite_accepted_at: null,
                invite_temp_password_encrypted: encryptToken(temporaryPassword)
            })
            .eq('id', member.id)
            .eq('organization_id', orgId);

        if (updateErr) throw updateErr;

        const inviteLink = `${getFrontendBaseUrl()}/accept-invite?token=${encodeURIComponent(inviteToken)}`;
        await sendTeamInviteEmail({
            email: member.email,
            name: member.name || member.email,
            role: member.role || 'agent',
            password: temporaryPassword,
            inviteLink,
            expiresAt: inviteExpiresAt
        });

        res.json({ success: true, message: 'Invitation resent', expires_at: inviteExpiresAt.toISOString() });
    } catch (err: any) {
        console.error('Resend invitation error:', err);
        res.status(500).json({ error: err.message || 'Failed to resend invitation' });
    }
}

export async function updateMember(req: any, res: Response) {
    const orgId = req.organization_id;
    const { id } = req.params;
    const { role, is_active, name } = req.body;

    try {
        const { error } = await supabase
            .from('organization_members')
            .update({ role, is_active, name })
            .eq('id', id)
            .eq('organization_id', orgId);

        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function deleteMember(req: any, res: Response) {
    const orgId = req.organization_id;
    const { id } = req.params;

    try {
        const { data: member } = await supabase
            .from('organization_members')
            .select('user_id')
            .eq('id', id)
            .eq('organization_id', orgId)
            .single();

        if (member && member.user_id) {
            await supabase.auth.admin.deleteUser(member.user_id);
        }

        const { error } = await supabase
            .from('organization_members')
            .delete()
            .eq('id', id)
            .eq('organization_id', orgId);

        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function getMyProfile(req: any, res: Response) {
    try {
        const { data, error } = await supabase
            .from('organization_members')
            .select('*')
            .eq('user_id', req.user.id)
            .maybeSingle();

        if (error) throw error;
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function updateMyProfile(req: any, res: Response) {
    try {
        const name = String(req.body?.name || '').trim();
        const avatarColor = String(req.body?.avatar_color || '').trim();

        if (!name) return res.status(400).json({ error: 'Name is required' });
        if (name.length > 80) return res.status(400).json({ error: 'Name must be 80 characters or less' });
        if (avatarColor && !/^#[0-9a-fA-F]{6}$/.test(avatarColor)) {
            return res.status(400).json({ error: 'Invalid avatar color' });
        }

        const updatePayload: any = {
            name,
            avatar_color: avatarColor || '#4f46e5'
        };

        const { data, error } = await supabase
            .from('organization_members')
            .update(updatePayload)
            .eq('user_id', req.user.id)
            .eq('organization_id', req.organization_id)
            .select('*')
            .maybeSingle();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Profile not found' });

        try {
            await supabase.auth.admin.updateUserById(req.user.id, {
                user_metadata: {
                    ...(req.user.user_metadata || {}),
                    full_name: name,
                    name,
                    avatar_color: updatePayload.avatar_color
                }
            });
        } catch (metadataErr: any) {
            console.warn('[Profile] Failed to sync auth metadata:', metadataErr?.message || metadataErr);
        }

        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to update profile' });
    }
}

export async function getAgents(req: any, res: Response) {
    const organization_id = req.organization_id;

    try {
        const { data, error } = await supabase
            .from('organization_members')
            .select('user_id, name, email, role, is_active')
            .eq('organization_id', organization_id)
            .eq('role', 'agent')
            .eq('is_active', true);

        if (error) throw error;
        res.json(data || []);
    } catch (err: any) {
        console.error('Error fetching agents for auto assign:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch agents' });
    }
}
