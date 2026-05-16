import dotenv from "dotenv";
dotenv.config({ path: "./.env" });
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import multer from "multer";
import path from "path";
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    downloadContentFromMessage,
    makeCacheableSignalKeyStore,
    Browsers,
    proto,
} from "@whiskeysockets/baileys";
import * as fs from "fs";
import { sendEmail } from "./email.js";
import pino from "pino";

const app = express();
const extraCorsOrigins = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

const corsOrigins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:3001",
    "https://parted-deuce-penpal.ngrok-free.dev",
    "https://w.getaipilot.in",
    "https://wb.getaipilot.in",
    ...extraCorsOrigins
];

const corsAllowedHeaders = [
    "Content-Type",
    "Authorization",
    "X-Auth-Portal",
    "X-N8N-Secret",
    "ngrok-skip-browser-warning"
];

app.use(cors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: corsAllowedHeaders
}));

// Keep raw body for Meta signature verification
app.use(
    express.json({
        verify: (req: any, _res, buf) => {
            req.rawBody = buf;
        },
    })
);

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: corsOrigins,
        methods: ["GET", "POST", "PATCH"],
        allowedHeaders: corsAllowedHeaders,
        credentials: true
    },
});

const PORT = Number(process.env.PORT || 3001);
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const GRAPH_API_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';
const N8N_HANDOFF_WEBHOOK_URL = process.env.N8N_HANDOFF_WEBHOOK_URL || '';
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || '';
const N8N_WEBHOOK_TIMEOUT_MS = Number(process.env.N8N_WEBHOOK_TIMEOUT_MS || 15000);

const MEDIA_BUCKET = process.env.SUPABASE_MEDIA_BUCKET || 'wa-media';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const KNOWLEDGE_MAX_FILE_SIZE = 10 * 1024 * 1024;
const KNOWLEDGE_MAX_CONTEXT_CHARS = 80_000;
const KNOWLEDGE_ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
]);

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));

// ====== Baileys Global Session State ======
const sessions = new Map<string, any>();
const latestQrBySession = new Map<string, { qr: string; createdAt: number }>();
const groupNameCache = new Map<string, { subject: string; fetchedAt: number }>();
const GROUP_NAME_TTL_MS = 5 * 60 * 1000;
const profilePhotoCache = new Map<string, { url: string | null; fetchedAt: number }>();
const PROFILE_PHOTO_TTL_MS = 30 * 60 * 1000;
const initializingSessions = new Set<string>();
const reconnectAttempts = new Map<string, number>();
const MAX_RECONNECT_ATTEMPTS = 5;

// ====== ENV ======
const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN!;
const APP_SECRET = process.env.META_APP_SECRET!;
const ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN!;
const PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID!;

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// ====== AES-256-CBC Token Encryption ======
// TOKEN_ENCRYPTION_KEY must be exactly 32 ASCII characters in .env
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || '';

function encryptToken(token: string): string {
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
        console.warn('âš ï¸ TOKEN_ENCRYPTION_KEY not set or not 32 chars â€” storing token unencrypted!');
        return token;
    }
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    const encrypted = Buffer.concat([cipher.update(token), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptToken(stored: string): string {
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32 || !stored.includes(':')) {
        // Not encrypted (legacy plain-text or key not set) â€” return as-is
        return stored;
    }
    try {
        const [ivHex, encHex] = stored.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString();
    } catch {
        // Fallback: might be a legacy plain-text token
        return stored;
    }
}

async function inspectMetaTokenPermissions(token: string) {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret || !token) {
        return { checked: false, missingScopes: [], scopes: [], error: null };
    }

    try {
        const debugUrl = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
        const response = await fetch(debugUrl);
        const data: any = await response.json();
        if (!response.ok || data.error) {
            return {
                checked: true,
                missingScopes: [],
                scopes: [],
                error: data.error?.message || 'Unable to inspect Meta token'
            };
        }

        const scopes = Array.isArray(data.data?.scopes) ? data.data.scopes : [];
        const requiredScopes = ['whatsapp_business_messaging', 'whatsapp_business_management'];
        const missingScopes = requiredScopes.filter(scope => !scopes.includes(scope));
        return { checked: true, missingScopes, scopes, error: null };
    } catch (err: any) {
        return { checked: true, missingScopes: [], scopes: [], error: err.message || 'Unable to inspect Meta token' };
    }
}

function getMetaSendErrorMessage(error: any) {
    const code = error?.code;
    const details = error?.error_data?.details || error?.message || '';
    if (code === 131005) {
        return `(#131005) Access denied: selected WhatsApp account token cannot send messages with this phone number. Reconnect the account using a token with whatsapp_business_messaging permission, and make sure the phone number belongs to the same WABA/token. Meta details: ${details}`;
    }
    const parts = [
        error?.message,
        details && details !== error?.message ? details : '',
        error?.error_subcode ? `subcode ${error.error_subcode}` : '',
        error?.fbtrace_id ? `trace ${error.fbtrace_id}` : ''
    ].filter(Boolean);
    return parts.join(' | ') || 'API Error';
}

async function getMetaAccountDiagnostics(account: any) {
    const token = account?.access_token_encrypted ? decryptToken(account.access_token_encrypted) : '';
    const diagnostics: any = {
        account_id: account?.id || null,
        phone_number_id: account?.phone_number_id || null,
        whatsapp_business_account_id: account?.whatsapp_business_account_id || null,
        has_access_token: !!token,
        token_permissions: null,
        phone_number_access: null,
        waba_access: null,
        send_ready: false,
        issues: []
    };

    if (!token) {
        diagnostics.issues.push('Missing Meta access token. Reconnect this account.');
        return diagnostics;
    }

    diagnostics.token_permissions = await inspectMetaTokenPermissions(token);
    if (diagnostics.token_permissions?.missingScopes?.length) {
        diagnostics.issues.push(`Token missing permission(s): ${diagnostics.token_permissions.missingScopes.join(', ')}`);
    }

    if (account?.phone_number_id) {
        try {
            const phoneRes = await fetch(`https://graph.facebook.com/v21.0/${account.phone_number_id}?fields=id,display_phone_number,verified_name,quality_rating,platform_type,code_verification_status&access_token=${encodeURIComponent(token)}`);
            const phoneJson: any = await phoneRes.json();
            diagnostics.phone_number_access = phoneJson;
            if (!phoneRes.ok || phoneJson.error) {
                diagnostics.issues.push(`Token cannot access phone number ${account.phone_number_id}: ${phoneJson.error?.message || 'Unknown Meta error'}`);
            }
        } catch (err: any) {
            diagnostics.issues.push(`Could not validate phone number access: ${err.message}`);
        }
    } else {
        diagnostics.issues.push('Missing phone_number_id on this account.');
    }

    if (account?.whatsapp_business_account_id) {
        try {
            const wabaRes = await fetch(`https://graph.facebook.com/v21.0/${account.whatsapp_business_account_id}/phone_numbers?access_token=${encodeURIComponent(token)}`);
            const wabaJson: any = await wabaRes.json();
            diagnostics.waba_access = wabaJson;
            if (!wabaRes.ok || wabaJson.error) {
                diagnostics.issues.push(`Token cannot access WABA ${account.whatsapp_business_account_id}: ${wabaJson.error?.message || 'Unknown Meta error'}`);
            } else if (account?.phone_number_id && !wabaJson.data?.some((phone: any) => String(phone.id) === String(account.phone_number_id))) {
                diagnostics.issues.push(`Phone number ${account.phone_number_id} was not found inside WABA ${account.whatsapp_business_account_id} for this token.`);
            }
        } catch (err: any) {
            diagnostics.issues.push(`Could not validate WABA phone list: ${err.message}`);
        }
    } else {
        diagnostics.issues.push('Missing whatsapp_business_account_id on this account.');
    }

    diagnostics.send_ready = diagnostics.issues.length === 0;
    return diagnostics;
}

async function getOrgWhatsappAccount(accountId: string, orgId: string) {
    const { data: account, error } = await supabase
        .from('w_wa_accounts')
        .select('*')
        .eq('id', accountId)
        .eq('organization_id', orgId)
        .maybeSingle();

    if (error) throw error;
    return account;
}

async function fetchMetaBusinessProfile(account: any) {
    const token = account?.access_token_encrypted ? decryptToken(account.access_token_encrypted) : '';
    if (!account?.phone_number_id || !token) throw new Error('Selected account is missing phone number ID or access token');

    const fields = 'about,address,description,email,profile_picture_url,websites,vertical';
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${account.phone_number_id}/whatsapp_business_profile?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
    const response = await fetch(url);
    const json: any = await response.json();
    if (!response.ok || json.error) throw new Error(json.error?.message || 'Failed to fetch WhatsApp business profile');

    return Array.isArray(json.data) ? (json.data[0] || {}) : json;
}

function formatMetaApiError(error: any, fallback: string) {
    if (!error) return fallback;
    const parts = [
        error.message,
        error.error_user_msg,
        error.error_data?.details,
        error.code ? `code ${error.code}` : '',
        error.error_subcode ? `subcode ${error.error_subcode}` : '',
        error.fbtrace_id ? `trace ${error.fbtrace_id}` : ''
    ].filter(Boolean);

    return parts.length ? parts.join(' | ') : fallback;
}

async function updateMetaBusinessProfile(account: any, body: any, profilePictureHandle?: string | null) {
    const token = account?.access_token_encrypted ? decryptToken(account.access_token_encrypted) : '';
    if (!account?.phone_number_id || !token) throw new Error('Selected account is missing phone number ID or access token');

    const payload: any = {
        messaging_product: 'whatsapp'
    };

    for (const key of ['about', 'address', 'description', 'email', 'vertical']) {
        if (Object.prototype.hasOwnProperty.call(body, key)) payload[key] = String(body[key] || '');
    }

    if (Object.prototype.hasOwnProperty.call(body, 'websites')) {
        const raw = body.websites;
        payload.websites = Array.isArray(raw)
            ? raw.filter(Boolean)
            : String(raw || '').split('\n').map((item) => item.trim()).filter(Boolean);
    }

    if (profilePictureHandle) payload.profile_picture_handle = profilePictureHandle;

    const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${account.phone_number_id}/whatsapp_business_profile`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    const json: any = await response.json();
    if (!response.ok || json.error) throw new Error(formatMetaApiError(json.error, 'Failed to update WhatsApp business profile'));
    return json;
}

async function uploadMetaProfilePicture(file: Express.Multer.File, token: string) {
    const appId = process.env.META_APP_ID;
    if (!appId) throw new Error('META_APP_ID is required to upload a profile picture');
    if (!file?.buffer?.length) throw new Error('Profile picture file is required');
    if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
        throw new Error('Profile picture must be a JPG or PNG image. WEBP is not accepted by Meta for WhatsApp profile pictures.');
    }

    const createUrl = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${appId}/uploads`);
    createUrl.searchParams.set('file_name', file.originalname || 'profile.jpg');
    createUrl.searchParams.set('file_length', String(file.buffer.length));
    createUrl.searchParams.set('file_type', file.mimetype || 'image/jpeg');
    createUrl.searchParams.set('access_token', token);

    const createRes = await fetch(createUrl, { method: 'POST' });
    const createJson: any = await createRes.json();
    if (!createRes.ok || createJson.error || !createJson.id) {
        throw new Error(formatMetaApiError(createJson.error, 'Failed to create Meta upload session'));
    }

    const uploadRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${createJson.id}`, {
        method: 'POST',
        headers: {
            Authorization: `OAuth ${token}`,
            file_offset: '0',
            'Content-Type': file.mimetype || 'application/octet-stream'
        },
        body: file.buffer as any
    });
    const uploadJson: any = await uploadRes.json();
    if (!uploadRes.ok || uploadJson.error || !uploadJson.h) {
        throw new Error(formatMetaApiError(uploadJson.error, 'Failed to upload profile picture to Meta'));
    }

    return uploadJson.h;
}

// ====== Auth Middleware (Supabase JWT) ======
async function authMiddleware(req: any, res: any, next: any) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized - missing token' });

    if (!supabase) return res.status(503).json({ error: 'Service unavailable - Supabase not configured' });

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            console.error("Supabase Auth Error:", error?.message || error);
            return res.status(401).json({ error: 'Unauthorized - invalid or expired token' });
        }

        req.user = user;
        
        // Fetch member role and org
        const { data: member } = await supabase
            .from('organization_members')
            .select('role, organization_id, is_active')
            .eq('user_id', user.id)
            .maybeSingle();
        
        // Resolve role and portal context

        const portal = req.headers['x-auth-portal'] || 'owner';
        const dbRole = member?.role;

        if (portal === 'agent') {
            if (!member) {
                return res.status(403).json({ error: 'Forbidden - Agent profile was not found' });
            }
            if (member.is_active === false) {
                return res.status(403).json({ error: 'Forbidden - Agent invitation is pending or expired' });
            }
            // Force agent role if logging into agent portal
            req.role = 'agent';
        } else {
            // Use actual database role or default to owner if no profile exists
            req.role = dbRole || 'owner';
        }

        let orgId = member?.organization_id || user.user_metadata?.organization_id || null;

        // AUTO-PROVISION: If no orgId found and user is an owner (or logging into owner portal)
        if (!orgId && req.role !== 'agent') {
            console.log(`[Auth] Auto-provisioning organization for: ${user.email}`);
            try {
                // Re-check for race condition
                const { data: checkAgain } = await supabase
                    .from('organization_members')
                    .select('organization_id')
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (checkAgain?.organization_id) {
                    orgId = checkAgain.organization_id;
                } else {
                    // 1. Create Organization
                    const orgName = `${user.email.split('@')[0]}'s Workspace`;
                    const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                    const { data: newOrg, error: orgErr } = await supabase
                        .from('organizations')
                        .insert({ 
                            name: orgName,
                            slug: slug,
                            plan_id: 'starter',
                            plan_status: 'trial',
                            is_active: true
                        })
                        .select()
                        .single();

                    if (orgErr) throw orgErr;

                    // 2. Create Member
                    const { error: memberErr } = await supabase
                        .from('organization_members')
                        .insert({
                            user_id: user.id,
                            organization_id: newOrg.id,
                            role: 'owner',
                            name: user.user_metadata?.full_name || user.email.split('@')[0],
                            email: user.email
                        });

                    if (memberErr) throw memberErr;

                    // 3. Update User Metadata (Optional but helps)
                    await supabase.auth.admin.updateUserById(user.id, {
                        user_metadata: { ...user.user_metadata, organization_id: newOrg.id }
                    });

                    orgId = newOrg.id;
                    console.log(`[Auth] Successfully provisioned org ${orgId} for ${user.email}`);
                }
            } catch (err: any) {
                console.error(`[Auth] Provisioning failed for ${user.email}:`, err.message);
                // Continue, might still fail 403 below
            }
        }
        
        if (!orgId) {
            console.warn(`⚠️ User ${user.email} (${user.id}) has no organization_id.`);
            return res.status(403).json({ error: 'Forbidden - User does not belong to any organization' });
        }
        
        req.organization_id = orgId;
        
        next();
    } catch (err: any) {
        console.error("Auth Middleware Exception:", err.message);
        return res.status(500).json({ error: 'Internal server error during authentication' });
    }
}

function decodeSupabaseJwtRole(token: string | null | undefined): string | null {
    if (!token) return null;
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    try {
        let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = payload.length % 4;
        if (pad) payload += '='.repeat(4 - pad);
        const decoded = Buffer.from(payload, 'base64').toString('utf8');
        const json = JSON.parse(decoded);
        return json?.role || null;
    } catch {
        return null;
    }
}

const SUPABASE_KEY_ROLE = decodeSupabaseJwtRole(SUPABASE_SERVICE_ROLE_KEY);
const INVITE_TTL_HOURS = Number(process.env.TEAM_INVITE_TTL_HOURS || 24);

console.log("Checking Env:", {
    SUPABASE_URL_PRESENT: !!SUPABASE_URL,
    KEY_PRESENT: !!SUPABASE_SERVICE_ROLE_KEY,
    KEY_ROLE: SUPABASE_KEY_ROLE || 'unknown',
    VERIFY_TOKEN: !!process.env.WA_VERIFY_TOKEN,
    URL_VALUE_START: SUPABASE_URL ? SUPABASE_URL.substring(0, 10) : "N/A"
});

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isAllZeroUuid(value: string) {
    return String(value).toLowerCase() === '00000000-0000-0000-0000-000000000000';
}

// ====== Global / Shared Constants ======
const DEFAULT_ORG_ID = null;
let resolvedOrgId: string | null = null;

async function ensureDefaultOrganizationId(): Promise<string | null> {
    return null;
}

function normalizeWaIdToPhone(value: string | null | undefined): string | null {
    if (!value) return null;
    const raw = String(value);
    const left = raw.includes('@') ? raw.split('@')[0] : raw;
    const digits = left.replace(/\D+/g, '');
    return digits.length >= 8 ? digits : null;
}

function normalizeIndianPhoneKey(value: string | null | undefined): string | null {
    const digits = normalizeWaIdToPhone(value);
    if (!digits) return null;

    // Accept:
    // - local 10-digit numbers => prefix 91
    // - E.164 without plus: 91XXXXXXXXXX (12 digits)
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return digits;

    // We intentionally do NOT try to coerce other lengths.
    // Values like "...@lid" are internal identifiers and not a real phone number.
    return null;
}

function derivePhoneForStorage(value: string | null | undefined): string | null {
    const raw = String(value || '').trim();
    if (!raw) return null;

    // Only derive phones for 1:1 identifiers.
    // Reject non-phone domains like @lid, @g.us, @newsletter.
    if (raw.includes('@') && !raw.endsWith('@s.whatsapp.net')) return null;

    const digits = normalizeWaIdToPhone(raw);
    if (!digits) return null;
    // India local numbers (10 digits) => prefix 91
    if (digits.length === 10) return `91${digits}`;
    // Generic E.164-ish digits
    if (digits.length >= 8 && digits.length <= 15) return digits;
    return null;
}

function normalizeTemplateHeaderMedia(mapping: any, fallbackType?: string) {
    const source = mapping && typeof mapping === 'object' ? mapping : {};
    const type = String(
        source._header_media_type ||
        source.header_media_type ||
        fallbackType ||
        ''
    ).toLowerCase();
    const url = String(
        source._header_media_url ||
        source.header_media_url ||
        source.headerImageUrl ||
        source.header_image_url ||
        source.headerUrl ||
        ''
    ).trim();

    return { type, url };
}

function normalizeDynamicUrlButtonValue(templateUrl: string, value: any) {
    let cleanValue = String(value || '').trim();
    const cleanTemplateUrl = String(templateUrl || '');
    const placeholderIndex = cleanTemplateUrl.indexOf('{{');
    const staticPrefix = placeholderIndex >= 0 ? cleanTemplateUrl.slice(0, placeholderIndex) : '';

    if (staticPrefix && cleanValue.startsWith(staticPrefix)) {
        cleanValue = cleanValue.slice(staticPrefix.length);
    }

    if (staticPrefix.endsWith('/') && cleanValue.startsWith('/')) {
        cleanValue = cleanValue.slice(1);
    }

    return cleanValue;
}

function validateDynamicUrlButtonValue(templateUrl: string, value: any) {
    const rawValue = String(value || '').trim();
    const cleanTemplateUrl = String(templateUrl || '');
    const placeholderIndex = cleanTemplateUrl.indexOf('{{');
    const staticPrefix = placeholderIndex >= 0 ? cleanTemplateUrl.slice(0, placeholderIndex) : '';
    const normalizedValue = normalizeDynamicUrlButtonValue(templateUrl, rawValue);
    const isAbsoluteUrl = /^https?:\/\//i.test(rawValue);

    if (staticPrefix && isAbsoluteUrl && !rawValue.startsWith(staticPrefix)) {
        return {
            ok: false,
            value: normalizedValue,
            error: `URL button is approved for ${staticPrefix}... Enter only the placeholder part for that approved URL, or create a new Meta template for this different domain.`
        };
    }

    if (staticPrefix && /^https?:\/\//i.test(normalizedValue)) {
        return {
            ok: false,
            value: normalizedValue,
            error: 'URL button needs only the placeholder value, not a full URL.'
        };
    }

    return {
        ok: !!normalizedValue,
        value: normalizedValue,
        error: 'URL button placeholder value is required.'
    };
}

function resolveTemplateButtonUrl(templateUrl: string, value: any) {
    const cleanTemplateUrl = String(templateUrl || '').trim();
    if (!cleanTemplateUrl) return '';

    const cleanValue = normalizeDynamicUrlButtonValue(cleanTemplateUrl, value);
    if (!cleanTemplateUrl.includes('{{')) return cleanTemplateUrl;

    return cleanTemplateUrl.replace(/\{\{\s*\d+\s*\}\}/g, cleanValue);
}

function formatIndianPhoneForDisplay(value: string | null | undefined): string {
    const key = normalizeIndianPhoneKey(value);
    if (!key) {
        const digits = normalizeWaIdToPhone(value);
        return digits ? digits : '';
    }
    return `+${key}`;
}

function toProfilePhotoJid(value: string | null | undefined) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (raw.includes('@g.us') || raw.includes('@newsletter')) return null;
    if (raw.includes('@s.whatsapp.net')) return raw;
    const digits = raw.replace(/\D+/g, '');
    if (digits.length < 8 || digits.length > 15) return null;
    return `${digits}@s.whatsapp.net`;
}

async function getCachedProfilePhotoUrl(waId: string | null | undefined) {
    const jid = toProfilePhotoJid(waId);
    if (!jid) return null;

    const cached = profilePhotoCache.get(jid);
    if (cached && Date.now() - cached.fetchedAt < PROFILE_PHOTO_TTL_MS) return cached.url;

    let attempted = false;
    for (const sock of sessions.values()) {
        try {
            if (!sock?.user?.id || typeof sock.profilePictureUrl !== 'function') continue;
            attempted = true;
            let url: string | null = null;
            try {
                url = await sock.profilePictureUrl(jid, 'image');
            } catch {
                url = await sock.profilePictureUrl(jid, 'preview');
            }
            profilePhotoCache.set(jid, { url: url || null, fetchedAt: Date.now() });
            return url || null;
        } catch {
            // WhatsApp privacy settings or missing profile photos commonly land here.
        }
    }

    if (attempted) profilePhotoCache.set(jid, { url: null, fetchedAt: Date.now() });
    return null;
}

function sanitizeContactDisplayName(name: string | null | undefined, waId: string): string | null {
    const raw = String(name || '').trim();
    if (!raw) return null;

    // Reject digit-only values; those are not a real display name.
    if (/^\d+$/.test(raw)) return null;

    // Never persist provider identifiers as a "name".
    // Examples: 886...@s.whatsapp.net, 886...@lid
    if (raw.includes('@')) return null;

    const waLeft = String(waId || '').split('@')[0];
    if (!waLeft) return raw;
    if (raw === waId || raw === waLeft) return null;

    return raw;
}

function isInvalidStoredContactName(name: any, waId: string): boolean {
    const raw = String(name || '').trim();
    if (!raw) return true;
    if (raw.includes('@')) return true;
    if (/^\d+$/.test(raw)) return true;
    const waLeft = String(waId || '').split('@')[0];
    if (waLeft && (raw === waId || raw === waLeft)) return true;
    return false;
}

function normalizeContactWaIdForStorage(value: string | null | undefined): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    // For 1:1 chats we store phone-only to keep ids stable.
    if (raw.endsWith('@s.whatsapp.net')) return raw.split('@')[0];
    return raw;
}

function pickBestBaileysContactName(c: any, waId: string): string | null {
    const candidate =
        (typeof c?.name === 'string' && c.name.trim() ? c.name.trim() : null) ||
        (typeof c?.notify === 'string' && c.notify.trim() ? c.notify.trim() : null) ||
        (typeof c?.verifiedName === 'string' && c.verifiedName.trim() ? c.verifiedName.trim() : null) ||
        null;

    return sanitizeContactDisplayName(candidate, waId);
}

function normalizeFilename(name: string) {
    return String(name || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_');
}

async function ensureMediaBucket() {
    if (!supabase) return;

    // Creating buckets requires the Supabase "service_role" key.
    // Many people accidentally paste the anon key into SUPABASE_SERVICE_ROLE_KEY,
    // which triggers the RLS error: "new row violates row-level security policy".
    if (SUPABASE_KEY_ROLE && SUPABASE_KEY_ROLE !== 'service_role') {
        console.warn(
            `âš ï¸ Supabase Storage bucket auto-create skipped (KEY_ROLE=${SUPABASE_KEY_ROLE}). ` +
            `Fix: set SUPABASE_SERVICE_ROLE_KEY to your project's Service Role key (server-side only), ` +
            `or create the bucket '${MEDIA_BUCKET}' manually in Supabase Dashboard.`
        );
        return;
    }

    try {
        const { data: buckets } = await supabase.storage.listBuckets();
        const exists = Array.isArray(buckets) && buckets.some((b: any) => b?.name === MEDIA_BUCKET);
        if (exists) return;
        const { error } = await supabase.storage.createBucket(MEDIA_BUCKET, { public: true });
        if (error) console.warn('âš ï¸ Failed to create media bucket:', error.message);
        else console.log(`âœ… Created Supabase storage bucket: ${MEDIA_BUCKET}`);
    } catch (err) {
        console.warn('âš ï¸ ensureMediaBucket failed:', err);
    }
}

async function streamToBuffer(stream: any): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

async function uploadMediaToStorage(params: {
    organization_id: string;
    conversation_id: string;
    fileName: string;
    mimeType: string;
    buffer: Buffer;
}) {
    // Prefer Supabase Storage when available; fall back to local /uploads when bucket/permissions fail.
    const safeName = normalizeFilename(params.fileName);
    const ext = safeName.includes('.') ? safeName.split('.').pop() : 'bin';

    if (supabase) {
        try {
            const storagePath = `${params.organization_id}/${params.conversation_id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
            const { error: upErr } = await supabase.storage
                .from(MEDIA_BUCKET)
                .upload(storagePath, params.buffer, { contentType: params.mimeType, upsert: false });
            if (!upErr) {
                const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);
                if (data?.publicUrl) return { path: storagePath, publicUrl: data.publicUrl };
            }
        } catch {
            // fall back to local
        }
    }

    const localName = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const diskPath = path.join(UPLOADS_DIR, localName);
    fs.writeFileSync(diskPath, params.buffer);
    return { path: `uploads/${localName}`, publicUrl: `${PUBLIC_BASE_URL}/uploads/${encodeURIComponent(localName)}` };
}

function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function normalizeKnowledgeDocument(doc: any) {
    return {
        id: String(doc?.id || crypto.randomUUID()),
        name: String(doc?.name || 'Untitled document'),
        mime_type: String(doc?.mime_type || 'application/octet-stream'),
        size: Number(doc?.size || 0),
        size_label: doc?.size_label || formatBytes(Number(doc?.size || 0)),
        status: doc?.status || 'INDEXED',
        content: String(doc?.content || '').slice(0, KNOWLEDGE_MAX_CONTEXT_CHARS),
        created_at: doc?.created_at || new Date().toISOString(),
        updated_at: doc?.updated_at || doc?.created_at || new Date().toISOString(),
    };
}

async function getOrganizationSettings(organizationId: string): Promise<any> {
    const { data, error } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', organizationId)
        .single();
    if (error) throw error;
    return data?.settings && typeof data.settings === 'object' ? data.settings : {};
}

async function getKnowledgeDocuments(organizationId: string) {
    const settings = await getOrganizationSettings(organizationId);
    const docs = Array.isArray(settings.knowledge_base_documents) ? settings.knowledge_base_documents : [];
    return docs.map(normalizeKnowledgeDocument);
}

async function saveKnowledgeDocuments(organizationId: string, documents: any[]) {
    const settings = await getOrganizationSettings(organizationId);
    const nextDocuments = documents.map(normalizeKnowledgeDocument);
    const nextSettings = {
        ...settings,
        knowledge_base_documents: nextDocuments,
        knowledge_base_updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
        .from('organizations')
        .update({ settings: nextSettings, updated_at: new Date().toISOString() })
        .eq('id', organizationId);
    if (error) throw error;
    return nextDocuments;
}

async function extractKnowledgeText(file: Express.Multer.File): Promise<string> {
    const mimeType = file.mimetype || '';
    const ext = path.extname(file.originalname || '').toLowerCase();

    if (['.txt', '.md', '.csv', '.json'].includes(ext) || mimeType.startsWith('text/') || mimeType === 'application/json') {
        return file.buffer.toString('utf8');
    }

    if (ext === '.docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const mammoth: any = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        return result?.value || '';
    }

    if (ext === '.pdf' || mimeType === 'application/pdf') {
        const pdfModule: any = await import('pdf-parse/lib/pdf-parse.js');
        const pdfParse = pdfModule.default || pdfModule;
        const result = await pdfParse(file.buffer);
        return result?.text || '';
    }

    throw new Error('Unsupported file type. Upload PDF, DOCX, TXT, MD, CSV, or JSON.');
}

async function getOrganizationKnowledgeContext(organizationId: string): Promise<string> {
    try {
        const docs = await getKnowledgeDocuments(organizationId);
        return docs
            .filter((doc: any) => doc.status === 'INDEXED' && doc.content)
            .map((doc: any) => `Source: ${doc.name}\n${doc.content}`)
            .join('\n\n')
            .slice(0, KNOWLEDGE_MAX_CONTEXT_CHARS);
    } catch (err: any) {
        console.warn('Failed to load organization knowledge base:', err?.message || err);
        return '';
    }
}

const AGENT_SETTINGS_ITEM_TYPE = '__agent_settings';

function getAgentAutomationSettings(agent: any) {
    const content = Array.isArray(agent?.knowledge_base_content) ? agent.knowledge_base_content : [];
    const item = content.find((entry: any) => entry?.type === AGENT_SETTINGS_ITEM_TYPE);
    const settings = item?.settings && typeof item.settings === 'object' ? item.settings : {};
    return {
        reply_on_keywords: settings.reply_on_keywords !== false,
        auto_reply_unknown: settings.auto_reply_unknown === true,
        default_for_new_chats: settings.default_for_new_chats === true,
        handoff_on_human_reply: settings.handoff_on_human_reply !== false,
    };
}

function stripAgentMetadataItems(items: any[]) {
    return (Array.isArray(items) ? items : []).filter((entry: any) => entry?.type !== AGENT_SETTINGS_ITEM_TYPE);
}

async function buildAgentKnowledgePayload(organizationId: string, params: any) {
    const docs = await getKnowledgeDocuments(organizationId);
    const selectedIds = Array.isArray(params.selected_knowledge_document_ids)
        ? params.selected_knowledge_document_ids.map((id: any) => String(id))
        : null;
    const selectedDocs = selectedIds
        ? docs.filter((doc: any) => selectedIds.includes(String(doc.id)))
        : docs.filter((doc: any) => (Array.isArray(params.knowledge_base) ? params.knowledge_base : []).includes(doc.name));

    const uploadedContent = stripAgentMetadataItems(params.knowledge_base_content || []);
    const docContent = selectedDocs.map((doc: any) => ({
        id: doc.id,
        name: doc.name,
        size: doc.size,
        size_label: doc.size_label,
        status: doc.status,
        content: doc.content,
        source: 'workspace_knowledge_base',
        updated_at: doc.updated_at,
    }));

    const automationSettings = {
        reply_on_keywords: params.automation_settings?.reply_on_keywords !== false,
        auto_reply_unknown: params.automation_settings?.auto_reply_unknown === true,
        default_for_new_chats: params.automation_settings?.default_for_new_chats === true,
        handoff_on_human_reply: params.automation_settings?.handoff_on_human_reply !== false,
    };

    const knowledgeBaseContent = [
        ...docContent,
        ...uploadedContent,
        {
            type: AGENT_SETTINGS_ITEM_TYPE,
            settings: automationSettings,
            selected_knowledge_document_ids: selectedDocs.map((doc: any) => doc.id),
            trained_at: new Date().toISOString(),
            training: {
                document_count: selectedDocs.length + uploadedContent.length,
                character_count: [...docContent, ...uploadedContent].reduce((sum: number, item: any) => sum + String(item?.content || '').length, 0),
            }
        }
    ];

    return {
        knowledge_base: [
            ...selectedDocs.map((doc: any) => doc.name),
            ...uploadedContent.map((item: any) => item?.name).filter(Boolean),
        ],
        knowledge_base_content: knowledgeBaseContent,
    };
}

async function downloadMetaMedia(params: {
    phone_number_id: string;
    mediaId: string;
}): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
    if (!supabase) return null;

    const { data: acc } = await supabase
        .from('w_wa_accounts')
        .select('access_token_encrypted')
        .eq('phone_number_id', params.phone_number_id)
        .maybeSingle();

    const rawToken = acc?.access_token_encrypted || ACCESS_TOKEN;
    const token = rawToken ? decryptToken(rawToken) : rawToken;
    if (!token) return null;

    const metaUrl = `https://graph.facebook.com/v21.0/${params.mediaId}`;
    const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!metaRes.ok) return null;
    const metaJson: any = await metaRes.json();
    const downloadUrl = metaJson?.url;
    const mimeType = metaJson?.mime_type || 'application/octet-stream';
    const fileName = metaJson?.filename || `media-${params.mediaId}`;
    if (!downloadUrl) return null;

    const binRes = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!binRes.ok) return null;
    const arrayBuf = await binRes.arrayBuffer();
    return { buffer: Buffer.from(arrayBuf), mimeType, fileName };
}

async function sendMediaMessageMeta(params: {
    phone_number_id: string;
    to: string;
    token: string;
    buffer: Buffer;
    mimeType: string;
    fileName: string;
    type: 'image' | 'video' | 'audio' | 'document';
    caption?: string;
}) {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', new Blob([new Uint8Array(params.buffer)], { type: params.mimeType }), params.fileName);

    const uploadUrl = `https://graph.facebook.com/v21.0/${params.phone_number_id}/media`;
    const upRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${params.token}` },
        body: form as any,
    });
    const upJson: any = await upRes.json().catch(() => ({}));
    if (!upRes.ok || !upJson?.id) throw new Error(`Meta media upload failed: ${JSON.stringify(upJson)}`);

    const payload: any = { messaging_product: 'whatsapp', to: params.to, type: params.type };
    if (params.type === 'image') payload.image = { id: upJson.id, ...(params.caption ? { caption: params.caption } : {}) };
    if (params.type === 'video') payload.video = { id: upJson.id, ...(params.caption ? { caption: params.caption } : {}) };
    if (params.type === 'audio') payload.audio = { id: upJson.id };
    if (params.type === 'document') payload.document = { id: upJson.id, filename: params.fileName, ...(params.caption ? { caption: params.caption } : {}) };

    const sendUrl = `https://graph.facebook.com/v21.0/${params.phone_number_id}/messages`;
    const sendRes = await fetch(sendUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${params.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const sendJson: any = await sendRes.json().catch(() => ({}));
    if (!sendRes.ok) throw new Error(`Meta send media failed: ${JSON.stringify(sendJson)}`);
    return { wa_message_id: sendJson?.messages?.[0]?.id || null, raw: sendJson };
}

let supabase: any;
try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.log("âŒ MISSING KEYS, SKIPPING SUPABASE (DEBUG MODE)");
    } else {
        supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        console.log("âœ… Supabase client created");
        ensureMediaBucket().catch(() => undefined);
    }
} catch (err) {
    console.log("âŒ Failed to create Supabase client:", err);
    // process.exit(1);
}

function assertEnv() {
    const missing = [
        !VERIFY_TOKEN && "WA_VERIFY_TOKEN",
        !APP_SECRET && "META_APP_SECRET",
        !ACCESS_TOKEN && "WA_ACCESS_TOKEN",
        !PHONE_NUMBER_ID && "WA_PHONE_NUMBER_ID",
        !SUPABASE_URL && "SUPABASE_URL",
        !SUPABASE_SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
    ].filter(Boolean);

    if (missing.length) {
        console.warn("âš ï¸ Missing env:", missing.join(", "));
    }
}
assertEnv();

// ====== Meta Signature Verify ======
function verifyMetaSignature(req: any) {
    const sig = req.get("X-Hub-Signature-256"); // sha256=...
    if (!sig || !APP_SECRET) return false;

    const expected =
        "sha256=" +
        crypto.createHmac("sha256", APP_SECRET).update(req.rawBody).digest("hex");

    try {
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
        return false;
    }
}

// ====== Webhook Verify (GET) ======
app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
});

// ====== Helper: send text message (Meta Cloud API) ======
// ====== Helper: send text message (Meta Cloud API) ======
async function sendTextMessage(to: string, body: string, phone_number_id: string | null = null, contextMessageId: string | null = null) {
    // If phone_number_id provided, fetch access token from DB
    let token = ACCESS_TOKEN;
    let fromId = PHONE_NUMBER_ID;

    if (phone_number_id && supabase) {
        const { data } = await supabase.from('w_wa_accounts').select('access_token_encrypted').eq('phone_number_id', phone_number_id).single();
        if (data?.access_token_encrypted) {
            token = decryptToken(data.access_token_encrypted);
            fromId = phone_number_id;
        }
    }

    if (!fromId || !token) throw new Error("Missing WA creds for send");

    const url = `https://graph.facebook.com/v21.0/${fromId}/messages`;

    const payload: any = {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
    };
    if (contextMessageId) {
        payload.context = { message_id: contextMessageId };
    }

    const r = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    const data = await r.json();
    if (!r.ok) {
        throw new Error(`Send failed: ${JSON.stringify(data)}`);
    }
    return data;
}

async function sendReactionMessage(to: string, targetMessageId: string, emoji: string | null, phone_number_id: string | null = null) {
    let token = ACCESS_TOKEN;
    let fromId = PHONE_NUMBER_ID;

    if (phone_number_id && supabase) {
        const { data } = await supabase.from('w_wa_accounts').select('access_token_encrypted').eq('phone_number_id', phone_number_id).single();
        if (data?.access_token_encrypted) {
            token = decryptToken(data.access_token_encrypted);
            fromId = phone_number_id;
        }
    }

    if (!fromId || !token) throw new Error("Missing WA creds for reaction");

    const url = `https://graph.facebook.com/v21.0/${fromId}/messages`;
    const payload = {
        messaging_product: "whatsapp",
        to,
        type: "reaction",
        reaction: {
            message_id: targetMessageId,
            emoji: emoji || "",
        },
    };

    const r = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    const data = await r.json();
    if (!r.ok) {
        throw new Error(data?.error?.message || `Reaction failed: ${JSON.stringify(data)}`);
    }
    return data;
}

async function sendInteractiveButtons(to: string, body: string, buttons: any[], footer: string = '', phone_number_id: string | null = null) {
    let token = ACCESS_TOKEN;
    let fromId = PHONE_NUMBER_ID;

    if (phone_number_id && supabase) {
        const { data } = await supabase.from('w_wa_accounts').select('access_token_encrypted').eq('phone_number_id', phone_number_id).single();
        if (data?.access_token_encrypted) {
            token = decryptToken(data.access_token_encrypted);
            fromId = phone_number_id;
        }
    }

    if (!fromId || !token) throw new Error("Missing WA creds for send");

    const url = `https://graph.facebook.com/v21.0/${fromId}/messages`;

    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: body },
            footer: footer ? { text: footer } : undefined,
            action: {
                buttons: buttons.map(b => ({
                    type: "reply",
                    reply: {
                        id: b.id,
                        title: b.text.substring(0, 20) // WhatsApp limit
                    }
                }))
            }
        }
    };

    const r = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    const data = await r.json();
    if (!r.ok) {
        throw new Error(`Interactive send failed: ${JSON.stringify(data)}`);
    }
    return data;
}

// ====== Connect WhatsApp Flow (Embedded Signup) ======
// 1. Start: Returns the URL to pop up
app.get("/api/wa/connect/start", (req, res) => {
    // These should be in your .env
    const appId = process.env.META_APP_ID;
    const configId = process.env.META_CONFIG_ID; // Created in Meta Dev Dashboard -> WhatsApp -> Configuration
    const redirectUri = process.env.META_REDIRECT_URI || "https://wb.getaipilot.in/wa-callback";
    // ^ Note: In local dev, this typically points to frontend, which then calls backend /api/wa/connect/callback
    // Or for simplicity, backend handles it if using server-side redirect. 
    // Current user flow: Button click -> Popup.

    // Ideally, frontend SDK triggers the popup. 
    // Detailed embedded signup usually involves the Facebook JavaScript SDK on the frontend.
    // If the user wants a simple Redirect flow:
    const scope = "whatsapp_business_management,whatsapp_business_messaging";

    // For Embedded Signup, it's often handled via FB SDK on client, returning a code/token to backend.
    // Assuming Frontend gets the "code" and calls backend to exchange/save.
    res.json({ appId, configId });
});

// 2. Callback: Exchange code for long-lived token & save
app.post("/api/wa/connect/callback", async (req, res) => {
    const { code, waba_id, organization_id } = req.body;

    if (!code) return res.status(400).json({ error: "Missing code" });

    try {
        // Exchange code for token
        const appId = process.env.META_APP_ID;
        const appSecret = process.env.META_APP_SECRET;
        const redirectUri = process.env.META_REDIRECT_URI;

        const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token` +
            `?client_id=${appId}` +
            `&client_secret=${appSecret}` +
            `&code=${code}` +
            (redirectUri ? `&redirect_uri=${encodeURIComponent(redirectUri)}` : '');
        const tokenRes = await fetch(tokenUrl);
        const tokenData = await tokenRes.json();

        if (!tokenData.access_token) throw new Error("Failed to get access token");

        const shortToken = tokenData.access_token;

        // Exchange for long-lived token (System User approach is best, but for Embedded flow:)
        const longTokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`;
        const longRes = await fetch(longTokenUrl);
        const longData = await longRes.json();

        const finalToken = longData.access_token || shortToken;
        const insertedAccounts = [];

        // --- NEW: Automatically Discover WABA IDs ---
        // Instead of requiring 'waba_id' from frontend, we fetch all WABAs a user has access to.
        const wabaDiscoveryUrl = `https://graph.facebook.com/v21.0/me/whatsapp_business_accounts?access_token=${finalToken}`;
        const wabaRes = await fetch(wabaDiscoveryUrl);
        const wabaData = await wabaRes.json();

        const discoveredWabaIds = wabaData.data || (waba_id ? [{ id: waba_id }] : []);
        
        if (discoveredWabaIds.length === 0) {
            throw new Error("No WhatsApp Business Accounts found for this user.");
        }

        // Process each discovered WABA
        for (const waba of discoveredWabaIds) {
            const currentWabaId = waba.id;
            
            // Fetch Phone Numbers for this specific WABA
            const numbersUrl = `https://graph.facebook.com/v21.0/${currentWabaId}/phone_numbers?access_token=${finalToken}`;
            const numRes = await fetch(numbersUrl);
            const numData = await numRes.json();

            if (numData.data) {
                for (const item of numData.data) {
                    const phone_number_id = item.id;
                    const display_phone_number = item.display_phone_number;

                    // Insert or Update in wa_accounts
                    const { data, error } = await supabase.from('w_wa_accounts').upsert({
                        organization_id: organization_id || DEFAULT_ORG_ID,
                        whatsapp_business_account_id: currentWabaId,
                        phone_number_id,
                        display_phone_number,
                        access_token_encrypted: encryptToken(finalToken),
                        status: 'connected'
                    }, { onConflict: 'phone_number_id' }).select();

                    if (error) console.error(`DB Save Error for phone ${phone_number_id}:`, error);
                    else if (data && data[0]) insertedAccounts.push(data[0]);
                }
            }
        }

        res.json({ success: true, accounts: insertedAccounts });

    } catch (e: any) {
        console.error("Connect Error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// 3. Logout: Clear session files and close connection
app.post("/api/wa/logout", async (req, res) => {
    const { sessionId, phone_number_id } = req.body;
    if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

    try {
        console.log(`Logout requested for session ${sessionId}`);
        const sock = sessions.get(sessionId);
        if (sock) {
            try {
                // sock.logout() sends a message to WhatsApp to invalidate the session
                // We also need to end the socket connection
                await sock.logout();
                sock.end(undefined);
            } catch (e) {
                console.error("Baileys logout error:", e);
            }
            sessions.delete(sessionId);
        }

        // Clean up session directory
        const sessionDir = `baileys_auth_info/${sessionId}`;
        if (fs.existsSync(sessionDir)) {
            // Using a small delay to ensure file handles are released by the OS
            setTimeout(() => {
                try {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                    console.log(`âœ… Session directory ${sessionId} cleared.`);
                } catch (e) {
                    console.error(`Failed to clear directory ${sessionId}:`, e);
                }
            }, 500);
        }
        
        // Clear all session states
        initializingSessions.delete(sessionId);
        latestQrBySession.delete(sessionId);
        reconnectAttempts.delete(sessionId);

        // Update DB if phone_number_id provided
        if (phone_number_id && supabase) {
            await supabase.from('w_wa_accounts')
                .update({ status: 'disconnected' })
                .eq('phone_number_id', phone_number_id);
        }

        res.json({ success: true, message: "Logged out successfully" });
    } catch (e: any) {
        console.error("Logout error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// ====== Helper: upsert contact ======
async function upsertContact(organization_id: string, wa_account_id: string, wa_id: string, name?: string | null) {
    const wa_key = normalizeIndianPhoneKey(wa_id);
    const safeName = sanitizeContactDisplayName(name, wa_id);

    // Determine contact type based on JID
    const isGroup = String(wa_id || '').includes('@g.us');
    const isChannel = String(wa_id || '').includes('@newsletter');
    const contact_type = isGroup ? 'group' : (isChannel ? 'channel' : 'individual');

    // Prefer matching by canonical phone key when available.
    let candidates: any[] = [];
    if (wa_key) {
        const { data, error } = await supabase
            .from('w_contacts')
            .select('id,name,custom_name,phone,wa_id,wa_key,created_at,custom_fields')
            .eq('organization_id', organization_id)
            .eq('wa_key', wa_key);
        if (error) throw error;
        candidates = Array.isArray(data) ? data : [];
    }

    if (!candidates.length) {
        const { data, error } = await supabase
            .from('w_contacts')
            .select('id,name,custom_name,phone,wa_id,wa_key,created_at,custom_fields')
            .eq('organization_id', organization_id)
            .eq('wa_id', wa_id)
            .limit(10);
        if (error) throw error;
        candidates = Array.isArray(data) ? data : [];
    }

    const pickBest = (rows: any[]) => {
        const scored = (rows || []).map((r) => {
            const score = (r?.custom_name ? 100 : 0) + (r?.name ? 10 : 0) + (r?.phone ? 1 : 0);
            const createdAt = r?.created_at ? new Date(r.created_at).getTime() : Number.POSITIVE_INFINITY;
            return { r, score, createdAt };
        });
        scored.sort((a, b) => b.score - a.score || a.createdAt - b.createdAt);
        return scored[0]?.r || null;
    };

    const existing = pickBest(candidates);
    const nowIso = new Date().toISOString();

    const maybePhone = wa_key ? wa_key : derivePhoneForStorage(wa_id);
    const profilePhotoUrl = await getCachedProfilePhotoUrl(maybePhone || wa_id);

    if (existing?.id) {
        const updates: any = {
            last_active: nowIso,
        };

        if (wa_key && !existing.wa_key) updates.wa_key = wa_key;
        if (!existing.phone && maybePhone) updates.phone = maybePhone;
        if (safeName && isInvalidStoredContactName(existing.name, wa_id)) updates.name = safeName;
        if (profilePhotoUrl) {
            updates.custom_fields = {
                ...(existing.custom_fields && typeof existing.custom_fields === 'object' ? existing.custom_fields : {}),
                profile_photo_url: profilePhotoUrl,
                profile_photo_checked_at: nowIso
            };
        }

        const { data: updated, error: updErr } = await supabase
            .from('w_contacts')
            .update(updates)
            .eq('id', existing.id)
            .select()
            .single();
        if (updErr) throw updErr;

        // If we learned a real name/phone, propagate it to any duplicates sharing wa_key.
        if (wa_key && (safeName || maybePhone)) {
            const propagate: any = { last_active: nowIso };
            if (safeName) propagate.name = safeName;
            if (maybePhone) propagate.phone = maybePhone;

            await supabase
                .from('w_contacts')
                .update(propagate)
                .eq('organization_id', organization_id)
                .eq('wa_key', wa_key)
                .or('name.is.null,name.eq.""');

            if (maybePhone) {
                await supabase
                    .from('w_contacts')
                    .update({ phone: maybePhone })
                    .eq('organization_id', organization_id)
                    .eq('wa_key', wa_key)
                    .is('phone', null);
            }
        }

        io.to(`org:${organization_id}`).emit('contact_updated', { contact: updated });
        return updated;
    }

    const insertPayload: any = {
        organization_id,
        wa_account_id,
        wa_id,
        name: safeName || null,
        last_active: nowIso,
        wa_key: wa_key || null,
        phone: maybePhone,
        contact_type,
    };

    if (profilePhotoUrl) {
        insertPayload.custom_fields = {
            profile_photo_url: profilePhotoUrl,
            profile_photo_checked_at: nowIso
        };
    }

    // Use upsert with ON CONFLICT to handle race conditions
    const { data: inserted, error: insErr } = await supabase
        .from('w_contacts')
        .upsert(insertPayload, { 
            onConflict: 'organization_id,wa_id',
            ignoreDuplicates: false 
        })
        .select()
        .single();

    if (insErr) throw insErr;
    io.to(`org:${organization_id}`).emit('contact_updated', { contact: inserted });
    return inserted;
}

// ====== Helper: Auto Assign Conversation ======
async function performAutoAssignment(organization_id: string, conversation_id: string) {
    try {
        // 1. Fetch organization settings
        const { data: org, error: orgErr } = await supabase
            .from('organizations')
            .select('settings')
            .eq('id', organization_id)
            .single();

        if (orgErr || !org?.settings?.auto_assign?.enabled) return;

        const config = org.settings.auto_assign;
        const batchSize = Math.max(1, config.batch_size || 1);
        const pausedAgents = config.paused_agents || [];
        let state = config.state || { last_agent_id: null, current_batch_count: 0 };

        // 2. Fetch eligible agents
        const { data: members, error: memErr } = await supabase
            .from('organization_members')
            .select('user_id')
            .eq('organization_id', organization_id)
            .eq('role', 'agent')
            .eq('is_active', true);
        
        if (memErr || !members || members.length === 0) return;

        const eligibleAgents = members
            .map((m: any) => m.user_id)
            .filter((id: string) => !pausedAgents.includes(id));

        if (eligibleAgents.length === 0) return;

        // 3. Determine next agent
        let nextAgentId = eligibleAgents[0];
        let newBatchCount = 1;

        if (state.last_agent_id && eligibleAgents.includes(state.last_agent_id)) {
            if (state.current_batch_count < batchSize) {
                // Keep assigning to the same agent
                nextAgentId = state.last_agent_id;
                newBatchCount = state.current_batch_count + 1;
            } else {
                // Move to next agent
                const currentIndex = eligibleAgents.indexOf(state.last_agent_id);
                const nextIndex = (currentIndex + 1) % eligibleAgents.length;
                nextAgentId = eligibleAgents[nextIndex];
                newBatchCount = 1;
            }
        } else {
            // Last agent not found or no state, start fresh with first eligible
            nextAgentId = eligibleAgents[0];
            newBatchCount = 1;
        }

        // 4. Update the conversation
        const { data: updatedConv, error: updErr } = await supabase
            .from('w_conversations')
            .update({ assigned_agent_id: nextAgentId, assigned_to: nextAgentId })
            .eq('id', conversation_id)
            .select('assigned_agent_id, assigned_to')
            .single();
        
        if (updErr) throw updErr;

        // Fetch agent name
        const { data: agentData } = await supabase.from('organization_members').select('name').eq('user_id', nextAgentId).single();

        // Broadcast update
        io.to(`org:${organization_id}`).emit('conversation_updated', {
            id: conversation_id,
            assigned_agent_id: nextAgentId,
            assigned_agent_name: agentData?.name || null
        });

        // 5. Update state in organization settings
        const newAutoAssign = {
            ...config,
            state: { last_agent_id: nextAgentId, current_batch_count: newBatchCount }
        };

        await supabase
            .from('organizations')
            .update({ settings: { ...org.settings, auto_assign: newAutoAssign } })
            .eq('id', organization_id);

        console.log(`[Auto Assign] Assigned conversation ${conversation_id} to agent ${nextAgentId} (Count: ${newBatchCount}/${batchSize})`);

    } catch (e) {
        console.error('[Auto Assign Error]', e);
    }
}

// ====== Helper: upsert conversation ======
async function upsertConversation(organization_id: string, wa_account_id: string, contact_id: string, lastMessageOpts: any) {
    // UPSERT not supported on custom unique constraints easily in all pg versions via simple client, 
    // but here we have unique(organization_id, contact_id).

    // We want to increment unread_count if inbound, set to 0 if outbound (usually).
    // Actually, logic: 
    // If inbound: unread_count = unread_count + 1
    // If outbound: unread_count = 0 (agent replied)

    const { data: existing } = await supabase
        .from('w_conversations')
        .select('*')
        .eq('organization_id', organization_id)
        .eq('wa_account_id', wa_account_id)
        .eq('contact_id', contact_id)
        .maybeSingle();

    let newUnread = (existing?.unread_count || 0);

    if (lastMessageOpts.direction === 'inbound') {
        newUnread += 1;
    } else {
        newUnread = 0; // Agent replied, so it's read
    }

    const payload = {
        organization_id,
        wa_account_id,
        contact_id,
        last_message_at: new Date().toISOString(),
        last_message_preview: lastMessageOpts.preview || "Media",
        unread_count: newUnread,
        status: 'open'
    };

    if (existing) {
        const { data, error } = await supabase
            .from('w_conversations')
            .update(payload)
            .eq('id', existing.id)
            .select()
            .single();
        if (error) console.error("Conversation Update Error:", error);

        if (data && !data.assigned_agent_id && lastMessageOpts.direction === 'inbound') {
            // Run asynchronously to avoid blocking
            performAutoAssignment(organization_id, data.id).catch(console.error);
        }

        return data;
    } else {
        const { data, error } = await supabase
            .from('w_conversations')
            .insert(payload)
            .select()
            .single();
        if (error) console.error("Conversation Insert Error:", error);

        if (data && lastMessageOpts.direction === 'inbound') {
            performAutoAssignment(organization_id, data.id).catch(console.error);
        }

        return data;
    }
}

// ====== Helper: store message ======
async function storeMessage(params: {
    organization_id: string;
    contact_id: string;
    conversation_id?: string;
    wa_message_id?: string | null;
    direction: "inbound" | "outbound";
    type: string;
    content: any;
    status: "sent" | "delivered" | "read" | "failed";
    is_bot_reply?: boolean;
    bot_agent_id?: string | null;
    sender_type?: "customer" | "human_agent" | "ai_agent" | "system";
    sender_user_id?: string | null;
    is_internal_note?: boolean;
    automation_source?: "flow" | "ai_agent" | "broadcast" | "manual" | "webhook" | "n8n" | "system" | null;
    handoff_triggered?: boolean;
    metadata?: any;
}) {
    const textBody = typeof params.content?.text === 'string' ? params.content.text : null;
    const mediaUrl = typeof params.content?.media_url === 'string' ? params.content.media_url : null;
    const mediaMime = typeof params.content?.mime_type === 'string' ? params.content.mime_type : null;
    const mediaSize = Number.isFinite(Number(params.content?.size)) ? Number(params.content.size) : null;
    const durationSeconds = Number.isFinite(Number(params.content?.duration_seconds)) ? Number(params.content.duration_seconds) : null;
    const waveform = params.content?.waveform ?? null;
    const isBotReply = params.is_bot_reply === true
        || params.content?.is_bot_reply === true
        || params.content?.is_flow === true
        || !!params.bot_agent_id
        || !!params.content?.bot_agent_id;
    const botAgentId = params.bot_agent_id || params.content?.bot_agent_id || null;
    const senderType = params.sender_type
        || (params.is_internal_note ? 'system' : null)
        || (params.direction === 'inbound' ? 'customer' : null)
        || (isBotReply ? 'ai_agent' : 'human_agent');
    const automationSource = params.automation_source
        || (params.content?.is_flow ? 'flow' : null)
        || (isBotReply ? 'ai_agent' : null)
        || (params.direction === 'outbound' ? 'manual' : 'webhook');

    const payload = {
        organization_id: params.organization_id,
        conversation_id: (params as any).conversation_id,
        contact_id: params.contact_id,
        wa_message_id: params.wa_message_id || null,
        direction: params.direction,
        type: params.type,
        content: params.content,
        text_body: textBody,
        media_url: mediaUrl,
        media_mime: mediaMime,
        media_size: mediaSize,
        duration_seconds: durationSeconds,
        waveform,
        status: params.status,
        is_bot_reply: isBotReply,
        bot_agent_id: botAgentId,
        sender_type: senderType,
        sender_user_id: params.sender_user_id || null,
        is_internal_note: params.is_internal_note === true,
        automation_source: automationSource,
        handoff_triggered: params.handoff_triggered === true,
        metadata: params.metadata || {},
    };

    // During history sync Baileys can deliver the same WA message again.
    // Upsert by wa_message_id (unique) when present to avoid crashing ingestion.
    const op = params.wa_message_id
        ? supabase.from('w_messages').upsert(payload, { onConflict: 'wa_message_id' })
        : supabase.from('w_messages').insert(payload);

    const { data, error } = await op.select('id, wa_message_id, created_at').maybeSingle();
    if (error) throw error;
    return data;
}

type ReactionEntry = { emoji: string; from: string; at: string };

function applyReactionUpdate(current: any, emoji: string | null, from: string): ReactionEntry[] {
    const list: ReactionEntry[] = Array.isArray(current) ? current.filter(Boolean) : [];
    const cleaned = list.filter((r) => r && r.from !== from);
    if (!emoji) return cleaned;
    cleaned.push({ emoji, from, at: new Date().toISOString() });
    return cleaned;
}

// ====== Helper: get best flow reply from bot_flows ======
async function getFlowReply(organization_id: string, text: string) {
    const normalized = (text || "").toLowerCase().trim();
    if (!normalized) return null;

    const { data: flows, error } = await supabase
        .from('w_bot_flows')
        .select("id,name,trigger_keywords,flow_data,is_active")
        .eq("organization_id", organization_id)
        .eq("is_active", true);

    if (error) throw error;

    // Simple keyword match
    for (const flow of flows || []) {
        const keywords: string[] = flow.trigger_keywords || [];
        const hit = keywords.some((k) => normalized.includes(String(k).toLowerCase()));
        if (!hit) continue;

        // Expect flow_data like: { reply_text: "..." }
        const reply = flow.flow_data?.reply_text;
        if (reply) return String(reply);
    }

    return null;
}

// ====== Helper: get bot agent reply ======
async function getBotAgentReply(params: {
    organization_id: string;
    conversation_id: string;
    text: string;
}): Promise<{ reply: string; agent: any } | null> {
    const { organization_id, conversation_id, text } = params;
    const normalized = (text || "").toLowerCase().trim();
    if (!normalized) return null;

    try {
        // First check if bot is enabled for this specific conversation
        const { data: conv, error: convErr } = await supabase
            .from('w_conversations')
            .select('bot_enabled, assigned_bot_id')
            .eq('id', conversation_id)
            .single();

        if (convErr) throw convErr;

        // Per-chat toggle disables only AI-agent fallback. Flow Builder still runs first.
        if (conv?.bot_enabled === false) return null;

        // If no specific bot is selected for this conversation, check workspace bot rules.
        let targetAgent = null;

        if (conv?.bot_enabled && conv?.assigned_bot_id) {
            // Use the specifically assigned bot
            const { data: agent, error: agentErr } = await supabase
                .from('bot_agents')
                .select('*')
                .eq('id', conv.assigned_bot_id)
                .eq('is_active', true)
                .single();

            if (agentErr) throw agentErr;
            targetAgent = agent;
        } else {
            // Check all active bots and match by keywords
            const { data: agents, error: agentsErr } = await supabase
                .from('bot_agents')
                .select('*')
                .eq('organization_id', organization_id)
                .eq('is_active', true);

            if (agentsErr) throw agentsErr;

            // Find the first agent with matching keywords.
            for (const agent of agents || []) {
                const settings = getAgentAutomationSettings(agent);
                if (!settings.reply_on_keywords) continue;
                const keywords: string[] = agent.trigger_keywords || [];
                const hit = keywords.some((k: string) => normalized.includes(String(k).toLowerCase()));
                if (hit) {
                    targetAgent = agent;
                    break;
                }
            }

            // If no keyword matched, use a default/unknown-chat agent when configured.
            if (!targetAgent) {
                targetAgent = (agents || []).find((agent: any) => {
                    const settings = getAgentAutomationSettings(agent);
                    return settings.default_for_new_chats || settings.auto_reply_unknown;
                }) || null;
            }
        }

        if (!targetAgent) return null;

        // Get OpenAI API key
        let apiKey = process.env.OPENAI_API_KEY || '';
        if (!apiKey) {
            const { data: settings } = await supabase
                .from('openai_settings')
                .select('api_key_encrypted')
                .eq('organization_id', organization_id)
                .single();
            apiKey = settings?.api_key_encrypted || '';
        }

        if (!apiKey) {
            console.log('No OpenAI API key configured, using static reply');
            // Return a static reply if no API key
            return {
                reply: `Hi! I'm ${targetAgent.name}. ${targetAgent.description || 'How can I help you?'}`,
                agent: targetAgent
            };
        }

        // Build knowledge base context
        let knowledgeContext = await getOrganizationKnowledgeContext(organization_id);
        if (targetAgent.knowledge_base_content && Array.isArray(targetAgent.knowledge_base_content)) {
            const agentKnowledgeContext = stripAgentMetadataItems(targetAgent.knowledge_base_content)
                .map((item: any) => item?.content || '')
                .filter(Boolean)
                .join('\n\n');
            knowledgeContext = [knowledgeContext, agentKnowledgeContext].filter(Boolean).join('\n\n').slice(0, KNOWLEDGE_MAX_CONTEXT_CHARS);
        }

        // Call OpenAI
        const systemPrompt = targetAgent.system_prompt || `You are ${targetAgent.name}, a helpful WhatsApp assistant. ${targetAgent.description || ''}`;
        
        const messages = [
            {
                role: 'system',
                content: systemPrompt + (knowledgeContext ? `\n\nKnowledge Base:\n${knowledgeContext}` : ''),
            },
            {
                role: 'user',
                content: text,
            },
        ];

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: targetAgent.model || 'gpt-3.5-turbo',
                messages,
                temperature: Number(targetAgent.temperature) || 0.7,
                max_tokens: 500,
            }),
        });

        const data: any = await response.json();

        if (!response.ok) {
            console.error('OpenAI API error:', data.error?.message || 'Unknown error');
            return {
                reply: `Hi! I'm ${targetAgent.name}. I'm having trouble processing your request right now. Please try again later.`,
                agent: targetAgent
            };
        }

        const reply = data.choices?.[0]?.message?.content || '';
        if (!reply) return null;

        return { reply, agent: targetAgent };
    } catch (err) {
        console.error('getBotAgentReply error:', err);
        return null;
    }
}

const SUPPORTED_FLOW_NODE_TYPES = new Set([
    'startBotFlow',
    'textMessage',
    'button',
    'userInput',
    'condition',
    'image',
    'video',
    'audio',
    'file',
    'location',
    'handoff',
    'end',
]);

type FlowEngineResult = {
    consumed: boolean;
    output: string | null;
    interactive?: any;
    handoff?: boolean;
    flow_id?: string | null;
    flow_version_id?: string | null;
    flow_session_id?: string | null;
    flow_run_id?: string | null;
    flow_node_id?: string | null;
};

function parseFlowKeywords(value: any): string[] {
    if (Array.isArray(value)) {
        return value.map((v) => String(v || '').trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value.split(',').map((v) => v.trim()).filter(Boolean);
    }
    return [];
}

function getFlowTriggerKeywords(flow: any, nodesOverride?: any[]): string[] {
    const nodes = Array.isArray(nodesOverride) ? nodesOverride : (Array.isArray(flow?.nodes) ? flow.nodes : []);
    const startNode = nodes.find((n: any) => n?.type === 'startBotFlow');
    return [...new Set([
        ...parseFlowKeywords(flow?.trigger_keywords),
        ...parseFlowKeywords(flow?.triggers),
        ...parseFlowKeywords(startNode?.data?.config?.keywords),
    ])];
}

function normalizeFlowVariableKey(value: any) {
    return String(value || '')
        .trim()
        .replace(/^\{\{\s*/, '')
        .replace(/\s*\}\}$/, '')
        .trim()
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}

function renderFlowTemplate(value: any, state: any = {}) {
    return String(value || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, rawKey) => {
        const key = normalizeFlowVariableKey(rawKey);
        const foundKey = Object.keys(state || {}).find((candidate) => normalizeFlowVariableKey(candidate) === key);
        const replacement = foundKey ? state[foundKey] : state?.[key];
        return replacement == null ? '' : String(replacement);
    });
}

function validateFlowDefinition(flow: any) {
    const errors: string[] = [];
    const nodes: any[] = Array.isArray(flow?.nodes) ? flow.nodes : [];
    const edges: any[] = Array.isArray(flow?.edges) ? flow.edges : [];
    const nodeIds = new Set(nodes.map((n) => n?.id).filter(Boolean));
    const startNodes = nodes.filter((n) => n?.type === 'startBotFlow');

    if (startNodes.length !== 1) errors.push('Flow must have exactly one Start Bot Flow node.');
    if (nodes.length === 0) errors.push('Flow must contain at least one node.');

    for (const node of nodes) {
        if (!SUPPORTED_FLOW_NODE_TYPES.has(node?.type)) {
            errors.push(`Unsupported node "${node?.type || 'unknown'}" is not available in Phase 1.`);
        }
        const config = node?.data?.config || {};
        if (node?.type === 'textMessage' && !String(config.message || config.text || '').trim()) {
            errors.push('Text Message node must have message text.');
        }
        if (node?.type === 'button') {
            const buttons = Array.isArray(config.buttons) ? config.buttons.filter((b: any) => String(b?.text || '').trim()) : [];
            if (buttons.length === 0) errors.push('Button node must have at least one button.');
            if (buttons.length > 3) errors.push('Button node can have maximum 3 WhatsApp buttons.');
        }
        if (node?.type === 'userInput' && !String(config.saveToField || '').trim()) {
            errors.push('User Input node must save the answer to a field.');
        }
        if (node?.type === 'condition' && (!config.variable || !config.operator || !config.value)) {
            errors.push('Condition node must have variable, operator, and value.');
        }
    }

    if (startNodes.length === 1) {
        const keywords = getFlowTriggerKeywords(flow, nodes);
        if ((flow?.trigger_type || 'keyword') === 'keyword' && keywords.length === 0) {
            errors.push('Start node must have trigger keywords.');
        }
    }

    for (const edge of edges) {
        if (!nodeIds.has(edge?.source) || !nodeIds.has(edge?.target)) {
            errors.push('Flow has a broken connection.');
            break;
        }
    }

    if (startNodes.length === 1) {
        const reachable = new Set<string>();
        const stack = [startNodes[0].id];
        while (stack.length) {
            const id = stack.pop();
            if (!id || reachable.has(id)) continue;
            reachable.add(id);
            edges.filter((e) => e.source === id).forEach((e) => stack.push(e.target));
        }
        const unreachable = nodes.filter((n) => n?.id && !reachable.has(n.id));
        if (unreachable.length > 0) errors.push(`${unreachable.length} node(s) are not connected to the Start node.`);
    }

    return { valid: errors.length === 0, errors };
}

async function logFlowStep(params: {
    organization_id: string;
    run_id?: string | null;
    node_id: string;
    node_type: string;
    input_data?: any;
    output_data?: any;
    status?: 'success' | 'failed' | 'skipped' | 'waiting';
    error_message?: string | null;
}) {
    if (!params.run_id) return;
    try {
        await supabase.from('w_flow_run_steps').insert({
            organization_id: params.organization_id,
            run_id: params.run_id,
            node_id: params.node_id,
            node_type: params.node_type,
            input_data: params.input_data || {},
            output_data: params.output_data || {},
            status: params.status || 'success',
            error_message: params.error_message || null,
        });
    } catch (err: any) {
        console.warn('[Flow] Step log failed:', err?.message || err);
    }
}

async function triggerHandoffWebhook(params: {
    organization_id: string;
    conversation_id: string;
    contact_id: string;
    flow_id?: string | null;
    flow_version_id?: string | null;
    flow_session_id?: string | null;
    flow_run_id?: string | null;
    flow_node_id?: string | null;
    handoff_reason?: string | null;
    summary_required?: boolean;
    state_data?: any;
    selected_text?: string | null;
    trigger_message_id?: string | null;
}) {
    if (!N8N_HANDOFF_WEBHOOK_URL || params.summary_required === false) return;

    try {
        const { data: conversation } = await supabase
            .from('w_conversations')
            .select('id, assigned_agent_id, assigned_to, handoff_status, summary_status, last_message_at')
            .eq('id', params.conversation_id)
            .eq('organization_id', params.organization_id)
            .maybeSingle();

        const { data: contact } = await supabase
            .from('w_contacts')
            .select('id, name, custom_name, phone, wa_id, custom_fields')
            .eq('id', params.contact_id)
            .eq('organization_id', params.organization_id)
            .maybeSingle();

        const { data: recentRows } = await supabase
            .from('w_messages')
            .select('id, direction, sender_type, automation_source, text_body, content, created_at')
            .eq('organization_id', params.organization_id)
            .eq('conversation_id', params.conversation_id)
            .order('created_at', { ascending: false })
            .limit(50);

        const messages = (recentRows || []).reverse().map((message: any) => ({
            id: message.id,
            direction: message.direction,
            sender_type: message.sender_type,
            automation_source: message.automation_source,
            text: message.text_body || message.content?.text || message.content?.body || '',
            created_at: message.created_at,
        }));

        const payload = {
            event: 'flow_handoff_requested',
            organization_id: params.organization_id,
            conversation_id: params.conversation_id,
            contact_id: params.contact_id,
            flow_id: params.flow_id || null,
            flow_version_id: params.flow_version_id || null,
            flow_session_id: params.flow_session_id || null,
            flow_run_id: params.flow_run_id || null,
            flow_node_id: params.flow_node_id || null,
            trigger_message_id: params.trigger_message_id || null,
            selected_text: params.selected_text || null,
            handoff_reason: params.handoff_reason || 'Flow requested human handoff',
            state_data: params.state_data || {},
            summary_required: true,
            callback_url: `${PUBLIC_BASE_URL}/api/n8n/conversations/${params.conversation_id}/summary`,
            contact,
            conversation,
            messages,
            created_at: new Date().toISOString(),
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), N8N_WEBHOOK_TIMEOUT_MS);

        const response = await fetch(N8N_HANDOFF_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(N8N_WEBHOOK_SECRET ? { 'X-N8N-Secret': N8N_WEBHOOK_SECRET } : {}),
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`HTTP ${response.status} ${body}`.trim());
        }
    } catch (err: any) {
        console.error('[n8n] Handoff webhook failed:', err?.message || err);
        await supabase
            .from('w_conversations')
            .update({
                summary_status: 'failed',
            })
            .eq('id', params.conversation_id)
            .eq('organization_id', params.organization_id);
    }
}

// ====== Helper: Process Flow Engine ======
async function processFlowEngine(organization_id: string, contact_id: string, conversation_id: string, text: string, triggerMessageId?: string | null): Promise<FlowEngineResult> {
    const normalized = text.toLowerCase().trim();

    // Flow Builder has priority and is independent from the per-chat AI-agent toggle.

    // 1. Check for active session
    const { data: session } = await supabase
        .from('w_flow_sessions')
        .select('*')
        .eq('organization_id', organization_id)
        .eq('conversation_id', conversation_id)
        .in('status', ['active', 'waiting'])
        .maybeSingle();

    let currentFlowId: string | null = null;
    let currentNodeId: string | null = null;
    let session_id: string | null = null;
    let currentFlowVersionId: string | null = null;
    let run_id: string | null = null;
    let isResuming = false;

    if (session) {
        currentFlowId = session.flow_id;
        currentFlowVersionId = session.flow_version_id || null;
        currentNodeId = session.current_node_id;
        session_id = session.id;
        run_id = session.active_run_id || null;
        isResuming = true;
    } else {
        // 2. Check for trigger matches in active flows
        const { data: activeFlows } = await supabase
            .from('w_flows')
            .select('*')
            .eq('organization_id', organization_id)
            .eq('status', 'active');

        let matchedFlow = null;
        let matchedVersion = null;
        for (const flow of activeFlows || []) {
            let version = null;
            if (flow.current_version_id) {
                const { data } = await supabase
                    .from('w_flow_versions')
                    .select('*')
                    .eq('id', flow.current_version_id)
                    .maybeSingle();
                version = data;
            }
            const nodes = version?.nodes || flow.nodes || [];
            const allTriggers = getFlowTriggerKeywords(version || flow, nodes);

            if (allTriggers.some((t: string) => normalized.includes(t.toLowerCase()))) {
                matchedFlow = flow;
                matchedVersion = version;
                break;
            }
        }

        if (!matchedFlow) {
            console.log('[Flow] No active flow matched; AI fallback may run', {
                organization_id,
                conversation_id,
                text: normalized,
                active_flow_count: activeFlows?.length || 0,
                triggers: (activeFlows || []).map((flow: any) => ({
                    id: flow.id,
                    name: flow.name,
                    trigger_keywords: flow.trigger_keywords,
                    triggers: flow.triggers,
                })),
            });
            return { consumed: false, output: null };
        }

        console.log('[Flow] Matched active flow', {
            organization_id,
            conversation_id,
            flow_id: matchedFlow.id,
            flow_name: matchedFlow.name,
            flow_version_id: matchedVersion?.id || matchedFlow.current_version_id || null,
        });

        currentFlowId = matchedFlow.id;
        currentFlowVersionId = matchedVersion?.id || matchedFlow.current_version_id || null;
        // Find start node
        const nodes = matchedVersion?.nodes || matchedFlow.nodes || [];
        const startNode = nodes.find((n: any) => n.type === 'startBotFlow');
        if (!startNode) return { consumed: false, output: null };

        currentNodeId = startNode.id;

        // Create or find active session
        const { data: newSession, error: sessErr } = await supabase
            .from('w_flow_sessions')
            .insert({
                organization_id,
                conversation_id,
                contact_id,
                flow_id: currentFlowId,
                flow_version_id: currentFlowVersionId,
                current_node_id: currentNodeId,
                status: 'active',
                state_data: {}
            })
            .select()
            .single();

        if (sessErr) {
            console.error('Session create error:', sessErr);
            // Agar duplicate error hai toh existing session use karo
            if (sessErr.code === '23505') {
                const { data: existingSession } = await supabase
                    .from('w_flow_sessions')
                    .select('*')
                    .eq('organization_id', organization_id)
                    .eq('conversation_id', conversation_id)
                    .in('status', ['active', 'waiting'])
                    .maybeSingle();
                if (existingSession) {
                    currentFlowId = existingSession.flow_id;
                    currentFlowVersionId = existingSession.flow_version_id || currentFlowVersionId;
                    currentNodeId = existingSession.current_node_id;
                    session_id = existingSession.id;
                    run_id = existingSession.active_run_id || null;
                    isResuming = true;
                }
            }
        } else if (newSession) {
            session_id = newSession.id;
        }

        if (!run_id) {
            const { data: newRun } = await supabase
                .from('w_flow_runs')
                .insert({
                    organization_id,
                    conversation_id,
                    contact_id,
                    flow_id: currentFlowId,
                    flow_version_id: currentFlowVersionId,
                    session_id,
                    trigger_message_id: triggerMessageId || null,
                    status: 'running',
                })
                .select('id')
                .maybeSingle();
            run_id = newRun?.id || null;
            if (session_id && run_id) {
                await supabase.from('w_flow_sessions').update({ active_run_id: run_id }).eq('id', session_id);
            }
        }

        console.log(`🆕 New flow session created: ${session_id}, starting at node: ${currentNodeId}`);
    }

    if (!currentFlowId || !currentNodeId || !session_id) {
        return { consumed: false, output: null };
    }

    // Flow data load karo
    let flowData = null;
    if (currentFlowVersionId) {
        const { data } = await supabase
            .from('w_flow_versions')
            .select('nodes, edges')
            .eq('id', currentFlowVersionId)
            .maybeSingle();
        flowData = data;
    }
    if (!flowData) {
        const { data } = await supabase
            .from('w_flows')
            .select('nodes, edges')
            .eq('id', currentFlowId)
            .single();
        flowData = data;
    }

    if (!flowData) return { consumed: true, output: null };

    const nodes: any[] = flowData.nodes || [];
    const edges: any[] = flowData.edges || [];
    const { data: latestSessionState } = await supabase
        .from('w_flow_sessions')
        .select('state_data')
        .eq('id', session_id)
        .maybeSingle();
    let flowState = latestSessionState?.state_data || session?.state_data || {};
    const flowMeta = {
        flow_id: currentFlowId,
        flow_version_id: currentFlowVersionId,
        flow_session_id: session_id,
        flow_run_id: run_id,
    };

    // ----------------------------------------------------------------
    // RESUMING: User ne button click kiya ya kuch type kiya
    // Pehle current node ke edges check karo aur next node pe jao
    // ----------------------------------------------------------------
    if (isResuming) {
        const currentNode = nodes.find((n: any) => n.id === currentNodeId);

        if (currentNode?.type === 'button' || currentNode?.type === 'userInput') {
            if (currentNode.type === 'userInput') {
                const saveToField = normalizeFlowVariableKey(currentNode.data?.config?.saveToField);
                if (saveToField) {
                    const nextState = { ...(session?.state_data || {}), [saveToField]: text };
                    await supabase.from('w_flow_sessions').update({ state_data: nextState }).eq('id', session_id);
                    flowState = nextState;
                }
            }
            // User ka response match karo outgoing edges se
            const outEdges = edges.filter((e: any) => e.source === currentNodeId);
            let nextEdge: any = null;

            if (outEdges.length === 1) {
                nextEdge = outEdges[0];
            } else if (outEdges.length > 1) {
                const buttons = currentNode?.data?.config?.buttons || [];
                const matchedButtonIndex = buttons.findIndex((b: any) => String(b?.text || '').trim().toLowerCase() === normalized);
                if (matchedButtonIndex >= 0) {
                    nextEdge = outEdges.find((e: any) => e.sourceHandle === `button-${matchedButtonIndex}`);
                }
                // Button ID, title, ya label se match karo
                nextEdge = nextEdge || outEdges.find((e: any) => {
                    const handle = (e.sourceHandle || '').toLowerCase();
                    const label = (e.label || '').toLowerCase();
                    return handle === normalized || label === normalized || normalized.includes(handle);
                }) || outEdges.find((e: any) => {
                    // Fallback to sourceHandle comparison if label fails
                    return e.sourceHandle && normalized.includes(e.sourceHandle.toLowerCase());
                }) || outEdges[0]; // fallback: pehla edge
            }

            if (nextEdge) {
                currentNodeId = nextEdge.target;
                await supabase
                    .from('w_flow_sessions')
                    .update({ current_node_id: currentNodeId })
                    .eq('id', session_id);
                console.log(`➡️ Advancing to node: ${currentNodeId}`);
            } else {
                // Koi edge nahi — flow complete
                await supabase.from('w_flow_sessions').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', session_id);
                if (run_id) await supabase.from('w_flow_runs').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', run_id);
                return { consumed: true, output: null, ...flowMeta };
            }
        }
    }

    // ----------------------------------------------------------------
    // Node execution loop — current node se chalo
    // ----------------------------------------------------------------
    let activeNode = nodes.find((n: any) => n.id === currentNodeId);
    const outputText: string[] = [];
    let steps = 0;

    while (activeNode && steps < 15) {
        steps++;
        const nodeType = activeNode.type;
        const config = activeNode.data?.config || {};

        console.log(`⚙️ Executing node: ${nodeType} (${activeNode.id})`);
        await logFlowStep({
            organization_id,
            run_id,
            node_id: activeNode.id,
            node_type: nodeType,
            input_data: { text },
            status: nodeType === 'button' || nodeType === 'userInput' ? 'waiting' : 'success',
        });

        // --- TEXT MESSAGE ---
        if (nodeType === 'textMessage') {
            const msg = config.message || config.text || activeNode.data?.label || '';
            if (msg) outputText.push(renderFlowTemplate(msg, flowState));
        }

        // --- BUTTON NODE ---
        else if (nodeType === 'button') {
            const body = renderFlowTemplate(config.text || config.headerText || 'Choose an option:', flowState);
            const footer = renderFlowTemplate(config.footerText || '', flowState);
            const buttons = (config.buttons || [])
                .filter((b: any) => b.text)
                .slice(0, 3);

            // Session mein current_node_id save karo — next message yahan se resume hoga
            await supabase.from('w_flow_sessions').update({ current_node_id: activeNode.id }).eq('id', session_id);

            if (buttons.length > 0) {
                return {
                    consumed: true,
                    output: outputText.length > 0 ? outputText.join('\n\n') : null,
                    ...flowMeta,
                    flow_node_id: activeNode.id,
                    interactive: {
                        type: 'button',
                        body,
                        footer,
                        buttons: buttons.map((b: any) => ({
                            id: b.id || b.text,
                            text: b.text
                        }))
                    }
                };
            } else {
                // Buttons nahi hain toh text fallback
                outputText.push(body);
                return { consumed: true, output: outputText.join('\n\n'), ...flowMeta, flow_node_id: activeNode.id };
            }
        }

        // --- USER INPUT NODE ---
        else if (nodeType === 'userInput') {
            const question = renderFlowTemplate(config.question || config.text || '', flowState);
            if (question) outputText.push(question);
            // Session save karo
            await supabase.from('w_flow_sessions').update({ current_node_id: activeNode.id }).eq('id', session_id);
            return { consumed: true, output: outputText.join('\n\n'), ...flowMeta, flow_node_id: activeNode.id };
        }

        // --- CONDITION NODE ---
        else if (nodeType === 'condition') {
            const variable = (config.variable || '').toLowerCase();
            const operator = config.operator || 'contains';
            const value = (config.value || '').toLowerCase();

            let conditionMet = false;
            if (operator === 'contains') conditionMet = normalized.includes(value);
            else if (operator === 'equals') conditionMet = normalized === value;
            else if (operator === 'starts_with') conditionMet = normalized.startsWith(value);
            else if (operator === 'ends_with') conditionMet = normalized.endsWith(value);
            else conditionMet = true;

            // Condition ke hisaab se sahi edge dhundo
            const outEdges = edges.filter((e: any) => e.source === activeNode.id);
            const matchEdge = outEdges.find((e: any) => {
                const h = (e.sourceHandle || '').toLowerCase();
                return conditionMet ? (h === 'yes' || h === 'true') : (h === 'no' || h === 'false');
            }) || outEdges[0];

            if (matchEdge) {
                activeNode = nodes.find((n: any) => n.id === matchEdge.target);
                continue;
            } else {
                break;
            }
        }

        // --- MEDIA NODES (image, video, audio, file) ---
        else if (['image', 'video', 'audio', 'file'].includes(nodeType)) {
            const url = config.url || config.mediaUrl || '';
            const caption = config.caption || '';
            if (url) {
                outputText.push(caption ? `${caption}\n${url}` : url);
            }
        }

        // --- LOCATION NODE ---
        else if (nodeType === 'location') {
            const lat = config.latitude;
            const lng = config.longitude;
            const name = config.name || '';
            if (lat && lng) {
                outputText.push(`📍 ${name}\nhttps://maps.google.com/?q=${lat},${lng}`);
            }
        }

        // --- TEMPLATE NODE ---
        else if (nodeType === 'template') {
            const tplName = config.templateName;
            if (tplName) outputText.push(`[Template: ${tplName}]`);
        }

        // --- AI NODE (basic fallback) ---
        else if (nodeType === 'ai') {
            const prompt = config.prompt || config.systemPrompt || '';
            if (prompt) outputText.push(`[AI: ${prompt.substring(0, 50)}...]`);
        }

        // Automatic advance — next edge dhundo
        if (nodeType === 'handoff') {
            const handoffMessage = config.message || config.label || activeNode.data?.label || '';
            const conversationPatch: any = {
                handoff_status: 'handoff_requested',
                handoff_reason: config.reason || 'Flow requested human handoff',
                handoff_requested_at: new Date().toISOString(),
                summary_status: config.summaryRequired === false ? 'not_started' : 'pending',
            };
            if (config.disableBotAfterHandoff !== false) conversationPatch.bot_enabled = false;
            await supabase.from('w_conversations').update(conversationPatch).eq('id', conversation_id);
            await supabase.from('w_flow_sessions').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', session_id);
            if (run_id) await supabase.from('w_flow_runs').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', run_id);
            triggerHandoffWebhook({
                organization_id,
                conversation_id,
                contact_id,
                flow_id: flowMeta.flow_id,
                flow_version_id: flowMeta.flow_version_id,
                flow_session_id: flowMeta.flow_session_id,
                flow_run_id: flowMeta.flow_run_id,
                flow_node_id: activeNode.id,
                handoff_reason: conversationPatch.handoff_reason,
                summary_required: config.summaryRequired !== false,
                state_data: flowState,
                selected_text: text,
                trigger_message_id: triggerMessageId || null,
            }).catch((err) => console.error('[n8n] Handoff webhook failed:', err?.message || err));
            return { consumed: true, output: renderFlowTemplate(handoffMessage, flowState) || null, handoff: true, ...flowMeta, flow_node_id: activeNode.id };
        }

        if (nodeType === 'end') {
            await supabase.from('w_flow_sessions').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', session_id);
            if (run_id) await supabase.from('w_flow_runs').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', run_id);
            const finalMessage = config.message ? renderFlowTemplate(config.message, flowState) : null;
            return { consumed: true, output: finalMessage || (outputText.length > 0 ? outputText.join('\n\n') : null), ...flowMeta, flow_node_id: activeNode.id };
        }

        const nextEdge = edges.find((e: any) => e.source === activeNode.id);
        if (nextEdge) {
            activeNode = nodes.find((n: any) => n.id === nextEdge.target);
        } else {
            // Flow khatam
            await supabase.from('w_flow_sessions').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', session_id);
            if (run_id) await supabase.from('w_flow_runs').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', run_id);
            console.log(`✅ Flow completed for session ${session_id}`);
            activeNode = null;
        }
    }

    return {
        consumed: true,
        output: outputText.length > 0 ? outputText.join('\n\n') : null,
        ...flowMeta
    };
}

// ====== API Endpoints ======

app.get("/api/dashboard-stats", authMiddleware, async (req: any, res) => {
    try {
        const organization_id = req.organization_id;
        
        // 1. Total Messages (lifetime)
        const { count: totalMessages, error: e1 } = await supabase
            .from('w_messages')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', organization_id);
            
        // 2. Counts by status for rates
        const { data: statusCounts, error: e2 } = await supabase
            .from('w_messages')
            .select('status')
            .eq('organization_id', organization_id);
            
        if (e1 || e2) throw e1 || e2;

        const counts = {
            sent: 0,
            delivered: 0,
            read: 0,
            failed: 0
        };

        statusCounts?.forEach((m: { status: string }) => {
            if (m.status === 'sent') counts.sent++;
            if (m.status === 'delivered') counts.delivered++;
            if (m.status === 'read') counts.read++;
            if (m.status === 'failed') counts.failed++;
        });

        // 3. Contact count
        const { count: totalContacts, error: e3 } = await supabase
            .from('w_contacts')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', organization_id);

        const total = totalMessages || 0;
        const readRate = total > 0 ? (counts.read / total) * 100 : 0;
        const deliveryRate = total > 0 ? ((counts.delivered + counts.read) / total) * 100 : 0;
        const failureRate = total > 0 ? (counts.failed / total) * 100 : 0;

        res.json({
            metrics: {
                totalMessages: total,
                delivered: counts.delivered + counts.read,
                readRate: Math.round(readRate),
                failedRate: failureRate.toFixed(1),
                deliveryRate: Math.round(deliveryRate)
            },
            contacts: totalContacts || 0,
            health: {
                status: failureRate > 5 ? 'yellow' : (failureRate > 15 ? 'red' : 'green'),
                quality: Math.max(0, 100 - Math.round(failureRate * 2))
            }
        });
    } catch (err: any) {
        console.error("Dashboard stats error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/flow-sessions/:contact_id", async (req, res) => {
    try {
        const { contact_id } = req.params;
        const { data, error } = await supabase
            .from('w_flow_sessions')
            .select(`*, w_flows ( name )`)
            .eq('contact_id', contact_id)
            .eq('status', 'active')
            .maybeSingle();
        if (error) throw error;
        res.json(data || null);
    } catch(err: any) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/flow-sessions/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('w_flow_sessions').update({ status: 'abandoned' }).eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch(err: any) { res.status(500).json({ error: err.message }); }
});

function createInviteToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function hashInviteToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function createTemporaryPassword() {
    return `Flow-${crypto.randomBytes(6).toString('base64url')}`;
}

function getInviteExpiryDate() {
    return new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);
}

function getFrontendBaseUrl() {
    return process.env.FRONTEND_URL || 'http://localhost:3000';
}

function getMemberInviteState(member: any) {
    if (member?.invite_accepted_at || member?.is_active) return 'active';
    const expiresAt = member?.invite_expires_at ? new Date(member.invite_expires_at) : null;
    if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) return 'expired';
    return 'pending';
}

async function sendTeamInviteEmail(params: {
    email: string;
    name: string;
    role: string;
    password: string;
    inviteLink: string;
    expiresAt: Date;
}) {
    await sendEmail(
        params.email,
        `Invitation to join FlowsApp Team`,
        `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
            <h2 style="color: #25D366;">You've been invited!</h2>
            <p>Hello <strong>${params.name}</strong>,</p>
            <p>You have been invited to join the <strong>FlowsApp</strong> team as an <strong>${params.role}</strong>.</p>
            <p>Accept this invitation to activate your account and open your agent workspace.</p>
            
            <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <h3 style="margin-top: 0;">Invitation Details:</h3>
                <p>
                    <strong>Invite Link:</strong>
                    <a href="${params.inviteLink}" style="color: #0b66c3; font-weight: 600; text-decoration: none;">Click to open</a>
                    <span style="color: #777;">or right-click / long-press to copy</span>
                </p>
                <p><strong>Email ID:</strong> ${params.email}</p>
                <p><strong>Password:</strong> ${params.password}</p>
                <p><strong>Expires:</strong> ${params.expiresAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
            </div>

            <div style="margin: 30px 0;">
                <a href="${params.inviteLink}" style="background-color: #25D366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Accept Invitation</a>
            </div>
            <p style="color: #666; font-size: 14px;">For security, this invitation expires in ${INVITE_TTL_HOURS} hour${INVITE_TTL_HOURS === 1 ? '' : 's'}.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">This invitation was sent from the FlowsApp Dashboard.</p>
        </div>
        `
    );
}

app.get("/api/contacts/:id/profile-photo", authMiddleware, async (req: any, res) => {
    const orgId = req.organization_id;
    try {
        const { data: contact, error } = await supabase
            .from('w_contacts')
            .select('id, phone, wa_id, custom_fields')
            .eq('id', req.params.id)
            .eq('organization_id', orgId)
            .maybeSingle();

        if (error) throw error;
        if (!contact) return res.status(404).json({ error: 'Contact not found' });

        const url = await getCachedProfilePhotoUrl(contact.wa_id || contact.phone);
        if (url) {
            await supabase
                .from('w_contacts')
                .update({
                    custom_fields: {
                        ...(contact.custom_fields && typeof contact.custom_fields === 'object' ? contact.custom_fields : {}),
                        profile_photo_url: url,
                        profile_photo_checked_at: new Date().toISOString()
                    }
                })
                .eq('id', contact.id);
        }

        res.json({
            contact_id: contact.id,
            has_photo: !!url,
            profile_photo_url: url,
            active_whatsapp_sessions: sessions.size,
            jid: toProfilePhotoJid(contact.wa_id || contact.phone)
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to fetch profile photo' });
    }
});

app.get("/api/conversations", authMiddleware, async (req: any, res) => {
    const organization_id = req.organization_id;
    const wa_account_id = req.query.wa_account_id as string; // Optional filter
    const user_id = req.user.id;
    const user_role = req.role;

    if (!organization_id) {
        return res.status(403).json({ error: 'No organization linked to this account' });
    }

    try {
        let query = supabase
            .from('w_conversations')
            .select(`
                *,
                contact:w_contacts(id, name, custom_name, phone, wa_id, wa_key, created_at, tags, custom_fields)
            `)
            .eq("organization_id", organization_id)
            .order("last_message_at", { ascending: false });

        // ROLE BASED FILTERING (Step 2G)
        if (user_role === 'agent') {
            query = query.eq('assigned_agent_id', user_id);
        }

        if (wa_account_id && wa_account_id !== 'All') {
            if (isUuid(wa_account_id)) {
                query = query.eq('wa_account_id', wa_account_id);
            } else {
                // Frontend may pass a display phone (e.g. 9194...) instead of UUID/phone_number_id.
                const raw = String(wa_account_id);
                const digits = raw.replace(/\D+/g, '');

                const findAccountId = async (value: string) => {
                    const { data: byPhoneId, error: e1 } = await supabase
                        .from('w_wa_accounts')
                        .select('id')
                        .eq('phone_number_id', value)
                        .maybeSingle();
                    if (e1) throw e1;
                    if (byPhoneId?.id) return byPhoneId.id;

                    const { data: byDisplay, error: e2 } = await supabase
                        .from('w_wa_accounts')
                        .select('id')
                        .eq('display_phone_number', value)
                        .maybeSingle();
                    if (e2) throw e2;
                    if (byDisplay?.id) return byDisplay.id;

                    return null;
                };

                let accountId = await findAccountId(raw);
                if (!accountId && digits && digits !== raw) accountId = await findAccountId(digits);

                if (accountId) {
                    query = query.eq('wa_account_id', accountId);
                } else {
                    // Dev-friendly behavior: conversations may exist even if wa_accounts was never bootstrapped.
                    // In that case, don't blank the inbox; just skip the account filter.
                    console.warn(
                        `⚠️ wa_account_id filter '${wa_account_id}' could not be resolved to a wa_accounts.id. ` +
                        `Skipping account filter (dev mode).`
                    );
                }
            }
        }

        let { data: conversations, error } = await query;
        if (error) throw error;

        // Fetch Read States for this user
        let readStatesMap = new Map();
        if (user_id && conversations?.length) {
            const { data: reads, error: readErr } = await supabase
                .from('w_conversation_reads')
                .select('conversation_id, last_read_at')
                .eq('user_id', user_id)
                .in('conversation_id', conversations.map((c: any) => c.id));

            if (!readErr && reads) {
                reads.forEach((r: any) => readStatesMap.set(r.conversation_id, r.last_read_at));
            }
        }

        // Compute unread count from message statuses (source of truth).
        // This prevents stale conversations.unread_count from showing "all-time" counts.
        const unreadCountMap = new Map<string, number>();
        if (conversations?.length) {
            const conversationIds = conversations.map((c: any) => c.id);
            const { data: unreadRows, error: unreadErr } = await supabase
                .from('w_messages')
                .select('conversation_id')
                .in('conversation_id', conversationIds)
                .in('direction', ['inbound', 'in'])
                .neq('status', 'read');

            if (unreadErr) {
                console.warn('⚠️ Failed to compute unread counts:', unreadErr.message || unreadErr);
            } else if (Array.isArray(unreadRows)) {
                for (const row of unreadRows) {
                    const cid = (row as any)?.conversation_id;
                    if (!cid) continue;
                    unreadCountMap.set(cid, (unreadCountMap.get(cid) || 0) + 1);
                }
            }
        }

        // Transform Data
        const result = await Promise.all(conversations.map(async (c: any) => {
            const lastReadAt = readStatesMap.get(c.id);
            const userHasRead = lastReadAt ? new Date(lastReadAt) >= new Date(c.last_message_at) : false;

            const unread_for_user = unreadCountMap.get(c.id) || 0;

            const next = { ...c };

            // Normalize contact.phone for UI: prefer a real phone number over provider ids.
            if (next?.contact) {
                const phone = String(next.contact.phone || '').trim();
                if (!phone) {
                    const derived = derivePhoneForStorage(next.contact.wa_id);
                    if (derived) next.contact.phone = derived;
                }
                if (!next.contact.wa_key) {
                    next.contact.wa_key = normalizeIndianPhoneKey(next.contact.wa_id) || null;
                }
                const storedPhoto = next.contact.custom_fields?.profile_photo_url || null;
                next.contact.profile_photo_url = storedPhoto || await getCachedProfilePhotoUrl(next.contact.wa_id || next.contact.phone);
                if (next.contact.profile_photo_url && next.contact.profile_photo_url !== storedPhoto && next.contact.id) {
                    supabase
                        .from('w_contacts')
                        .update({
                            custom_fields: {
                                ...(next.contact.custom_fields && typeof next.contact.custom_fields === 'object' ? next.contact.custom_fields : {}),
                                profile_photo_url: next.contact.profile_photo_url,
                                profile_photo_checked_at: new Date().toISOString()
                            }
                        })
                        .eq('id', next.contact.id)
                        .then(({ error }: { error: any }) => {
                            if (error) console.warn('Failed to persist profile photo URL:', error.message);
                        });
                }
            }

            return {
                ...next,
                user_has_read: userHasRead,
                unread_for_user
            };
        }));

        res.json(result);
    } catch (err: any) {
        console.error("Error fetching conversations:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/contacts', authMiddleware, async (req: any, res) => {
    const organization_id = req.organization_id;
    const includeGroups = req.query.include_groups === 'true';
    
    if (!organization_id) {
        return res.status(403).json({ error: 'No organization linked to this account' });
    }

    try {
        let query = supabase
            .from('w_contacts')
            .select('id, name, custom_name, phone, wa_id, wa_key, wa_account_id, tags, custom_fields, created_at, last_active, contact_type')
            .eq('organization_id', organization_id)
            .order('created_at', { ascending: false });

        // By default, only show individual w_contacts (not groups/channels)
        if (!includeGroups) {
            query = query.or('contact_type.eq.individual,contact_type.is.null');
        }

        let { data, error } = await query;
        if (error) throw error;

        const rows = (data || []).map((c: any) => {
            const next = { ...c };
            const phone = String(next.phone || '').trim();
            if (!phone) {
                const derived = derivePhoneForStorage(next.wa_id);
                if (derived) next.phone = derived;
            }
            if (!next.wa_key) {
                next.wa_key = normalizeIndianPhoneKey(next.wa_id) || null;
            }
            return next;
        });

        res.json(rows);
    } catch (err: any) {
        console.error('Error fetching contacts:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch contacts' });
    }
});

app.post('/api/contacts', authMiddleware, async (req: any, res) => {
    const organization_id = req.organization_id;
    const { name, phone, custom_name, tags = [], custom_fields = {}, wa_account_id = null } = req.body || {};

    try {
        if (!organization_id) {
            return res.status(400).json({ error: 'organization_id is required' });
        }

        const phoneDigits = normalizeWaIdToPhone(phone);
        if (!phoneDigits) {
            return res.status(400).json({ error: 'Valid phone number is required' });
        }

        const wa_key = normalizeIndianPhoneKey(phoneDigits) || phoneDigits;
        const normalizedPhone = wa_key;
        const normalizedTags = Array.isArray(tags)
            ? tags.map((tag: any) => String(tag).trim()).filter(Boolean)
            : String(tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
        const normalizedCustomFields = custom_fields && typeof custom_fields === 'object' && !Array.isArray(custom_fields)
            ? Object.fromEntries(Object.entries(custom_fields)
                .map(([key, value]) => [String(key).trim(), value == null ? '' : String(value).trim()])
                .filter(([key]) => Boolean(key)))
            : {};

        let normalizedAccountId: string | null = null;
        if (wa_account_id) {
            const { data: account, error: accountErr } = await supabase
                .from('w_wa_accounts')
                .select('id')
                .eq('id', String(wa_account_id))
                .eq('organization_id', organization_id)
                .maybeSingle();
            if (accountErr) throw accountErr;
            if (!account?.id) return res.status(400).json({ error: 'Selected WhatsApp account was not found' });
            normalizedAccountId = account.id;
        }

        const { data: existing, error: existingErr } = await supabase
            .from('w_contacts')
            .select('id')
            .eq('organization_id', organization_id)
            .eq('wa_key', wa_key)
            .maybeSingle();
        if (existingErr) throw existingErr;
        if (existing?.id) {
            return res.status(409).json({ error: 'Contact already exists' });
        }

        const { data, error } = await supabase
            .from('w_contacts')
            .insert({
                organization_id,
                wa_account_id: normalizedAccountId,
                name: String(name || '').trim() || normalizedPhone,
                custom_name: typeof custom_name === 'string' && custom_name.trim() ? custom_name.trim() : null,
                phone: normalizedPhone,
                wa_id: normalizedPhone,
                wa_key,
                tags: normalizedTags,
                custom_fields: normalizedCustomFields,
                contact_type: 'individual'
            })
            .select('id, name, custom_name, phone, wa_id, wa_key, wa_account_id, tags, custom_fields, created_at, last_active, contact_type')
            .single();
        if (error) throw error;

        io.emit('contact_updated', { contact: data });
        res.status(201).json(data);
    } catch (err: any) {
        console.error('Error creating contact:', err);
        res.status(500).json({ error: err.message || 'Failed to create contact' });
    }
});

app.patch('/api/contacts/:id', authMiddleware, async (req: any, res) => {
    const contactId = req.params.id;
    const organization_id = req.organization_id;

    try {
        if (!organization_id) {
            return res.status(400).json({ error: 'organization_id is required' });
        }

        const { data: existing, error: findErr } = await supabase
            .from('w_contacts')
            .select('id, organization_id, wa_key, custom_fields')
            .eq('id', contactId)
            .maybeSingle();
        if (findErr) throw findErr;
        if (!existing?.id) return res.status(404).json({ error: 'Contact not found' });
        if (existing.organization_id !== organization_id) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const updates: any = {};

        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'custom_name')) {
            const raw = (req.body?.custom_name ?? null);
            const custom_name = typeof raw === 'string' ? raw.trim() : null;
            updates.custom_name = custom_name ? custom_name : null;
        }

        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
            updates.name = String(req.body?.name || '').trim() || null;
        }

        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'phone')) {
            const phoneDigits = normalizeWaIdToPhone(req.body?.phone);
            if (!phoneDigits) return res.status(400).json({ error: 'Valid phone number is required' });
            const wa_key = normalizeIndianPhoneKey(phoneDigits) || phoneDigits;
            updates.phone = wa_key;
            updates.wa_id = wa_key;
            updates.wa_key = wa_key;
        }

        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'tags')) {
            updates.tags = Array.isArray(req.body.tags)
                ? req.body.tags.map((tag: any) => String(tag).trim()).filter(Boolean)
                : String(req.body.tags || '').split(',').map((tag: string) => tag.trim()).filter(Boolean);
        }

        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'custom_fields')) {
            const incoming = req.body.custom_fields && typeof req.body.custom_fields === 'object' && !Array.isArray(req.body.custom_fields)
                ? Object.fromEntries(Object.entries(req.body.custom_fields)
                    .map(([key, value]) => [String(key).trim(), value == null ? '' : String(value).trim()])
                    .filter(([key]) => Boolean(key)))
                : {};
            const currentFields = existing.custom_fields && typeof existing.custom_fields === 'object' ? existing.custom_fields : {};
            const protectedFields = ['profile_photo_url', 'profile_photo_checked_at'].reduce((acc: any, key) => {
                if (currentFields[key]) acc[key] = currentFields[key];
                return acc;
            }, {});
            updates.custom_fields = { ...incoming, ...protectedFields };
        }

        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'wa_account_id')) {
            const nextAccountId = req.body.wa_account_id ? String(req.body.wa_account_id) : null;
            if (nextAccountId) {
                const { data: account, error: accountErr } = await supabase
                    .from('w_wa_accounts')
                    .select('id')
                    .eq('id', nextAccountId)
                    .eq('organization_id', organization_id)
                    .maybeSingle();
                if (accountErr) throw accountErr;
                if (!account?.id) return res.status(400).json({ error: 'Selected WhatsApp account was not found' });
            }
            updates.wa_account_id = nextAccountId;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No contact fields were provided' });
        }

        // Apply alias to duplicates sharing the same wa_key to keep chat names consistent.
        if (existing.wa_key && Object.prototype.hasOwnProperty.call(updates, 'custom_name')) {
            const { error: updAllErr } = await supabase
                .from('w_contacts')
                .update({ custom_name: updates.custom_name })
                .eq('organization_id', organization_id)
                .eq('wa_key', existing.wa_key);
            if (updAllErr) throw updAllErr;
        }

        const { data: updated, error: updErr } = await supabase
            .from('w_contacts')
            .update(updates)
            .eq('id', contactId)
            .select('id, name, custom_name, phone, wa_id, wa_key, wa_account_id, tags, custom_fields, created_at, last_active, contact_type')
            .single();
        if (updErr) throw updErr;

        io.emit('contact_updated', { contact: updated });
        res.json(updated);
    } catch (err: any) {
        console.error('Error updating contact:', err);
        res.status(500).json({ error: err.message || 'Failed to update contact' });
    }
});

app.delete('/api/contacts/:id', authMiddleware, async (req: any, res) => {
    const contactId = req.params.id;
    const organization_id = req.organization_id;

    try {
        if (!organization_id) {
            return res.status(400).json({ error: 'organization_id is required' });
        }

        const { data: existing, error: findErr } = await supabase
            .from('w_contacts')
            .select('id, organization_id')
            .eq('id', contactId)
            .maybeSingle();
        if (findErr) throw findErr;
        if (!existing?.id) return res.status(404).json({ error: 'Contact not found' });
        if (existing.organization_id !== organization_id) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { error } = await supabase
            .from('w_contacts')
            .delete()
            .eq('id', contactId)
            .eq('organization_id', organization_id);
        if (error) throw error;

        io.emit('contact_deleted', { id: contactId });
        res.json({ success: true });
    } catch (err: any) {
        console.error('Error deleting contact:', err);
        res.status(500).json({ error: err.message || 'Failed to delete contact' });
    }
});

// ====== Organization Knowledge Base API ======
app.get('/api/settings/knowledge-base', authMiddleware, async (req: any, res) => {
    try {
        const documents = await getKnowledgeDocuments(req.organization_id);
        res.json({
            documents: documents.map((doc: any) => ({
                ...doc,
                content_preview: doc.content ? doc.content.slice(0, 220) : '',
                character_count: String(doc.content || '').length,
                content: undefined,
            })),
            total_documents: documents.length,
            total_characters: documents.reduce((sum: number, doc: any) => sum + String(doc.content || '').length, 0),
        });
    } catch (err: any) {
        console.error('Knowledge base list error:', err);
        res.status(500).json({ error: err.message || 'Failed to load knowledge base' });
    }
});

app.post('/api/settings/knowledge-base', authMiddleware, upload.single('file'), async (req: any, res) => {
    try {
        const file = req.file as Express.Multer.File | undefined;
        if (!file) return res.status(400).json({ error: 'File is required' });
        if (file.size > KNOWLEDGE_MAX_FILE_SIZE) {
            return res.status(400).json({ error: 'File must be 10MB or smaller' });
        }

        const ext = path.extname(file.originalname || '').toLowerCase();
        const isAllowedExt = ['.pdf', '.docx', '.txt', '.md', '.csv', '.json'].includes(ext);
        const isAllowedMime = KNOWLEDGE_ALLOWED_MIME_TYPES.has(file.mimetype || '') || (file.mimetype || '').startsWith('text/');
        if (!isAllowedExt && !isAllowedMime) {
            return res.status(400).json({ error: 'Unsupported file type. Upload PDF, DOCX, TXT, MD, CSV, or JSON.' });
        }

        const extracted = (await extractKnowledgeText(file)).replace(/\r/g, '').replace(/\n{4,}/g, '\n\n\n').trim();
        if (!extracted) {
            return res.status(400).json({ error: 'No readable text found in this file' });
        }

        const existing = await getKnowledgeDocuments(req.organization_id);
        const now = new Date().toISOString();
        const doc = normalizeKnowledgeDocument({
            id: crypto.randomUUID(),
            name: normalizeFilename(file.originalname || 'knowledge-document'),
            mime_type: file.mimetype || 'application/octet-stream',
            size: file.size,
            size_label: formatBytes(file.size),
            status: 'INDEXED',
            content: extracted,
            created_at: now,
            updated_at: now,
        });

        const documents = await saveKnowledgeDocuments(req.organization_id, [doc, ...existing].slice(0, 50));
        res.status(201).json({
            document: {
                ...doc,
                content_preview: doc.content.slice(0, 220),
                content: undefined,
            },
            total_documents: documents.length,
        });
    } catch (err: any) {
        console.error('Knowledge base upload error:', err);
        res.status(500).json({ error: err.message || 'Failed to upload knowledge document' });
    }
});

app.delete('/api/settings/knowledge-base/:id', authMiddleware, async (req: any, res) => {
    try {
        const existing = await getKnowledgeDocuments(req.organization_id);
        const next = existing.filter((doc: any) => doc.id !== req.params.id);
        if (next.length === existing.length) return res.status(404).json({ error: 'Document not found' });
        await saveKnowledgeDocuments(req.organization_id, next);
        res.json({ success: true });
    } catch (err: any) {
        console.error('Knowledge base delete error:', err);
        res.status(500).json({ error: err.message || 'Failed to delete knowledge document' });
    }
});

// ====== Team Management APIs ======

// 2A. GET /api/team/members — All team members fetch karo
app.get('/api/team/members', authMiddleware, async (req: any, res) => {
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
});

// 2B. POST /api/team/invite — Naya agent invite karo
app.post('/api/team/invite', authMiddleware, async (req: any, res) => {
    const orgId = req.organization_id;
    const { email, name, role, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !name || !password) return res.status(400).json({ error: 'Email, name and password are required' });

    try {
        const inviteToken = createInviteToken();
        const inviteExpiresAt = getInviteExpiryDate();
        const temporaryPassword = password || createTemporaryPassword();

        // 1. Check if user already member
        const { data: existing } = await supabase
            .from('organization_members')
            .select('*')
            .eq('organization_id', orgId)
            .ilike('email', normalizedEmail)
            .maybeSingle();

        // 2. Create user via Supabase Admin (Requires service_role key)
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
                // If user already exists, we might get an error. Try to find the user instead.
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

        // 3. Insert/update organization_members
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

        // 4. Send custom invitation email
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
            // We don't throw here so the user is still created/invited in the DB
        }

        res.json({ success: true, message: 'Member invited successfully and email sent', expires_at: inviteExpiresAt.toISOString() });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// 2C. PATCH /api/team/members/:id — Role/Status update karo
app.post('/api/team/invite/accept', async (req: any, res) => {
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
            await supabase
                .from('organization_members')
                .update({ is_active: false })
                .eq('id', member.id);
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
});

app.post('/api/team/members/:id/resend-invite', authMiddleware, async (req: any, res) => {
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
});

app.patch('/api/team/members/:id', authMiddleware, async (req: any, res) => {
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
});

// 2D. DELETE /api/team/members/:id — Member remove karo
app.delete('/api/team/members/:id', authMiddleware, async (req: any, res) => {
    const orgId = req.organization_id;
    const { id } = req.params;

    try {
        // Find the user_id of the member to delete their auth account
        const { data: member } = await supabase
            .from('organization_members')
            .select('user_id')
            .eq('id', id)
            .eq('organization_id', orgId)
            .single();

        if (member && member.user_id) {
            // Delete user from auth to completely revoke access
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
});

// 2E. GET /api/team/my-profile — Current agent ka profile
app.get('/api/team/my-profile', authMiddleware, async (req: any, res) => {
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
});

// 2F. PATCH /api/team/my-profile — Current user's basic profile
app.patch('/api/team/my-profile', authMiddleware, async (req: any, res) => {
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
});

// 2G. PATCH /api/conversations/:id/assign — Chat assign karo agent ko
app.patch('/api/conversations/:id/assign', authMiddleware, async (req: any, res) => {
    const orgId = req.organization_id;
    const { id } = req.params;
    const { agent_id } = req.body;

    try {
        const normalizedAgentId = agent_id ? String(agent_id) : null;
        if (normalizedAgentId) {
            const { data: member, error: memberErr } = await supabase
                .from('organization_members')
                .select('user_id, role, is_active')
                .eq('organization_id', orgId)
                .eq('user_id', normalizedAgentId)
                .maybeSingle();
            if (memberErr) throw memberErr;
            if (!member || member.role !== 'agent' || member.is_active === false) {
                return res.status(400).json({ error: 'Conversation can only be assigned to an active agent' });
            }
        }

        const { data: updated, error } = await supabase
            .from('w_conversations')
            .update({ 
                assigned_to: normalizedAgentId,
                assigned_agent_id: normalizedAgentId
            })
            .eq('id', id)
            .eq('organization_id', orgId)
            .select('id, assigned_to')
            .single();

        if (error) throw error;

        io.to(`org:${orgId}`).emit('conversation_assigned', { conversation_id: id, assigned_to: normalizedAgentId });
        res.json({ success: true, conversation: updated });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/conversations/:id/meta', authMiddleware, async (req: any, res) => {
    const orgId = req.organization_id;
    const { id } = req.params;
    const payload: any = {};

    if (typeof req.body?.status === 'string') {
        const status = req.body.status.trim().toLowerCase();
        if (!['open', 'archived', 'closed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid conversation status' });
        }
        payload.status = status;
    }

    if (Array.isArray(req.body?.labels)) {
        payload.labels = req.body.labels
            .map((label: any) => String(label || '').trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 20);
    }

    if (Object.keys(payload).length === 0) {
        return res.status(400).json({ error: 'No conversation fields provided' });
    }

    try {
        const { data, error } = await supabase
            .from('w_conversations')
            .update(payload)
            .eq('id', id)
            .eq('organization_id', orgId)
            .select('id, status, labels')
            .maybeSingle();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Conversation not found' });

        io.to(`org:${orgId}`).emit('conversation_updated', data);
        res.json({ success: true, conversation: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to update conversation' });
    }
});

app.post('/api/conversations/:id/unread', authMiddleware, async (req: any, res) => {
    const orgId = req.organization_id;
    const { id } = req.params;

    try {
        const { data: conv, error: convErr } = await supabase
            .from('w_conversations')
            .select('id')
            .eq('id', id)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (convErr) throw convErr;
        if (!conv) return res.status(404).json({ error: 'Conversation not found' });

        const { data: latestInbound, error: msgErr } = await supabase
            .from('w_messages')
            .select('id')
            .eq('conversation_id', id)
            .in('direction', ['inbound', 'in'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (msgErr) throw msgErr;

        if (latestInbound?.id) {
            const { error: updErr } = await supabase
                .from('w_messages')
                .update({ status: 'delivered' })
                .eq('id', latestInbound.id);
            if (updErr) throw updErr;
        }

        await supabase
            .from('w_conversations')
            .update({ unread_count: 1 })
            .eq('id', id)
            .eq('organization_id', orgId);

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to mark unread' });
    }
});

app.post('/api/conversations/:id/clear', authMiddleware, async (req: any, res) => {
    const orgId = req.organization_id;
    const { id } = req.params;

    try {
        const { data: conv, error: convErr } = await supabase
            .from('w_conversations')
            .select('id')
            .eq('id', id)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (convErr) throw convErr;
        if (!conv) return res.status(404).json({ error: 'Conversation not found' });

        const { error: deleteErr } = await supabase
            .from('w_messages')
            .delete()
            .eq('conversation_id', id);
        if (deleteErr) throw deleteErr;

        const { data: updated, error: updateErr } = await supabase
            .from('w_conversations')
            .update({
                last_message_preview: 'No messages',
                unread_count: 0
            })
            .eq('id', id)
            .eq('organization_id', orgId)
            .select('id, last_message_preview, unread_count')
            .maybeSingle();
        if (updateErr) throw updateErr;

        io.to(`org:${orgId}`).emit('conversation_cleared', { conversation_id: id });
        res.json({ success: true, conversation: updated });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to clear chat' });
    }
});

app.delete('/api/conversations/:id', authMiddleware, async (req: any, res) => {
    const orgId = req.organization_id;
    const { id } = req.params;

    try {
        const { data: conv, error: convErr } = await supabase
            .from('w_conversations')
            .select('id')
            .eq('id', id)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (convErr) throw convErr;
        if (!conv) return res.status(404).json({ error: 'Conversation not found' });

        const { error: msgErr } = await supabase
            .from('w_messages')
            .delete()
            .eq('conversation_id', id);
        if (msgErr) throw msgErr;

        const { error: deleteErr } = await supabase
            .from('w_conversations')
            .delete()
            .eq('id', id)
            .eq('organization_id', orgId);
        if (deleteErr) throw deleteErr;

        io.to(`org:${orgId}`).emit('conversation_deleted', { conversation_id: id });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to delete chat' });
    }
});

app.get("/api/dashboard-stats", authMiddleware, async (req: any, res) => {
    const organization_id = req.organization_id;
    try {
        const { data, error } = await supabase.rpc('get_dashboard_stats', { p_organization_id: organization_id });
        if (error) throw error;
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ====== Flow Builder API ======
app.get('/api/flows', authMiddleware, async (req: any, res) => {
    const orgId = req.organization_id;
    try {
        const { data, error } = await supabase
            .from('w_flows')
            .select('*')
            .eq('organization_id', orgId)
            .neq('status', 'archived')
            .order('updated_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch(e: any) { res.status(500).json({error: e.message}); }
});

app.get('/api/flows/:id', authMiddleware, async (req: any, res) => {
    const orgId = req.organization_id;
    try {
        const { data, error } = await supabase
            .from('w_flows')
            .select('*')
            .eq('id', req.params.id)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Flow not found' });
        res.json(data);
    } catch(e: any) { res.status(500).json({error: e.message}); }
});

app.post('/api/flows', authMiddleware, async (req: any, res) => {
    const orgId = req.organization_id;
    try {
        const nodes = Array.isArray(req.body?.nodes) ? req.body.nodes : [];
        const triggerKeywords = getFlowTriggerKeywords({ ...req.body, nodes }, nodes);
        const payload = {
            name: String(req.body?.name || '').trim(),
            description: req.body?.description || null,
            status: req.body?.status === 'active' ? 'draft' : (req.body?.status || 'draft'),
            trigger_type: req.body?.trigger_type || 'keyword',
            trigger_keywords: triggerKeywords,
            triggers: triggerKeywords,
            nodes,
            edges: Array.isArray(req.body?.edges) ? req.body.edges : [],
            organization_id: orgId,
            created_by_user_id: req.user?.id || null,
            updated_by_user_id: req.user?.id || null,
        };
        if (!payload.name) return res.status(400).json({ error: 'Flow name is required' });
        const { data, error } = await supabase.from('w_flows').insert(payload).select().single();
        if (error) throw error;
        res.status(201).json(data);
    } catch(e: any) { res.status(500).json({error: e.message}); }
});

app.put('/api/flows/:id', authMiddleware, async (req: any, res) => {
    const { id } = req.params;
    const orgId = req.organization_id;
    try {
        const updateData: any = {};
        if (req.body.name !== undefined) updateData.name = String(req.body.name || '').trim();
        if (req.body.description !== undefined) updateData.description = req.body.description || null;
        if (req.body.nodes !== undefined) updateData.nodes = Array.isArray(req.body.nodes) ? req.body.nodes : [];
        if (req.body.edges !== undefined) updateData.edges = Array.isArray(req.body.edges) ? req.body.edges : [];
        if (req.body.trigger_type !== undefined) updateData.trigger_type = req.body.trigger_type || 'keyword';
        if (req.body.status !== undefined && ['draft', 'paused', 'archived'].includes(req.body.status)) updateData.status = req.body.status;
        if (updateData.nodes !== undefined || req.body.triggers !== undefined || req.body.trigger_keywords !== undefined) {
            const nodes = updateData.nodes !== undefined ? updateData.nodes : req.body.nodes;
            const triggerKeywords = getFlowTriggerKeywords({ ...req.body, nodes }, nodes);
            updateData.trigger_keywords = triggerKeywords;
            updateData.triggers = triggerKeywords;
        }
        updateData.updated_at = new Date().toISOString();
        updateData.updated_by_user_id = req.user?.id || null;

        const { data, error } = await supabase
            .from('w_flows')
            .update(updateData)
            .eq('id', id)
            .eq('organization_id', orgId)
            .select()
            .maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Flow not found' });
        res.json(data);
    } catch(e: any) { res.status(500).json({error: e.message}); }
});

app.post('/api/flows/:id/validate', authMiddleware, async (req: any, res) => {
    const orgId = req.organization_id;
    try {
        const { data: flow, error } = await supabase
            .from('w_flows')
            .select('*')
            .eq('id', req.params.id)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (error) throw error;
        if (!flow) return res.status(404).json({ error: 'Flow not found' });
        res.json(validateFlowDefinition(flow));
    } catch(e: any) { res.status(500).json({error: e.message}); }
});

app.post('/api/flows/:id/publish', authMiddleware, async (req: any, res) => {
    const orgId = req.organization_id;
    try {
        const { data: flow, error } = await supabase
            .from('w_flows')
            .select('*')
            .eq('id', req.params.id)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (error) throw error;
        if (!flow) return res.status(404).json({ error: 'Flow not found' });

        const validation = validateFlowDefinition(flow);
        if (!validation.valid) return res.status(400).json({ error: 'Flow validation failed', validation });

        const { data: latestVersion } = await supabase
            .from('w_flow_versions')
            .select('version_number')
            .eq('flow_id', flow.id)
            .order('version_number', { ascending: false })
            .limit(1)
            .maybeSingle();

        const versionNumber = Number(latestVersion?.version_number || 0) + 1;
        const triggerKeywords = getFlowTriggerKeywords(flow, flow.nodes || []);

        const { data: version, error: versionErr } = await supabase
            .from('w_flow_versions')
            .insert({
                organization_id: orgId,
                flow_id: flow.id,
                version_number: versionNumber,
                nodes: flow.nodes || [],
                edges: flow.edges || [],
                trigger_type: flow.trigger_type || 'keyword',
                trigger_keywords: triggerKeywords,
                status: 'published',
                validation_errors: [],
                published_by_user_id: req.user?.id || null,
            })
            .select()
            .single();
        if (versionErr) throw versionErr;

        const { data: updated, error: updateErr } = await supabase
            .from('w_flows')
            .update({
                status: 'active',
                current_version_id: version.id,
                trigger_keywords: triggerKeywords,
                triggers: triggerKeywords,
                updated_at: new Date().toISOString(),
                updated_by_user_id: req.user?.id || null,
            })
            .eq('id', flow.id)
            .eq('organization_id', orgId)
            .select()
            .single();
        if (updateErr) throw updateErr;

        res.json({ success: true, flow: updated, version });
    } catch(e: any) { res.status(500).json({error: e.message}); }
});

app.get('/api/flows/:id/runs', authMiddleware, async (req: any, res) => {
    const orgId = req.organization_id;
    try {
        const { data, error } = await supabase
            .from('w_flow_runs')
            .select('*')
            .eq('organization_id', orgId)
            .eq('flow_id', req.params.id)
            .order('started_at', { ascending: false })
            .limit(50);
        if (error) throw error;
        res.json(data || []);
    } catch(e: any) { res.status(500).json({error: e.message}); }
});

app.get('/api/flow-runs/:id', authMiddleware, async (req: any, res) => {
    const orgId = req.organization_id;
    try {
        const { data: run, error } = await supabase
            .from('w_flow_runs')
            .select('*')
            .eq('organization_id', orgId)
            .eq('id', req.params.id)
            .maybeSingle();
        if (error) throw error;
        if (!run) return res.status(404).json({ error: 'Flow run not found' });
        const { data: steps, error: stepErr } = await supabase
            .from('w_flow_run_steps')
            .select('*')
            .eq('organization_id', orgId)
            .eq('run_id', run.id)
            .order('started_at', { ascending: true });
        if (stepErr) throw stepErr;
        res.json({ ...run, steps: steps || [] });
    } catch(e: any) { res.status(500).json({error: e.message}); }
});

app.delete('/api/flows/:id', authMiddleware, async (req: any, res) => {
    try {
        const { error } = await supabase
            .from('w_flows')
            .update({ status: 'archived', archived_at: new Date().toISOString() })
            .eq('id', req.params.id)
            .eq('organization_id', req.organization_id);
        if (error) throw error;
        res.json({success: true});
    } catch(e: any) { res.status(500).json({error: e.message}); }
});

// ====== Bot Agents API ======
// Get all bot agents for an organization
app.get('/api/agents', authMiddleware, async (req: any, res) => {
    const organization_id = req.organization_id;

    try {
        let query = supabase
            .from('bot_agents')
            .select('*')
            .order('created_at', { ascending: false });

        if (organization_id) {
            query = query.eq('organization_id', organization_id);
        }

        const { data, error } = await query;
        if (error) {
            // Check if table doesn't exist
            if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
                console.error('bot_agents table does not exist. Please run the migration.');
                return res.status(500).json({ 
                    error: 'Database table "bot_agents" not found. Please run the migration: supabase/migrations/20260127100000_add_bot_agents_and_conversation_bot_settings.sql' 
                });
            }
            throw error;
        }

        res.json(data || []);
    } catch (err: any) {
        console.error('Error fetching agents:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch agents' });
    }
});

// Create a new bot agent
app.post('/api/agents', authMiddleware, async (req: any, res) => {
    const organization_id = req.organization_id;

    try {
        if (!organization_id) {
            return res.status(400).json({ error: 'organization_id is required' });
        }

        const {
            name,
            description,
            model = 'gpt-3.5-turbo',
            temperature = 0.7,
            trigger_keywords = [],
            system_prompt,
            is_active = true
        } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Agent name is required' });
        }

        const knowledgePayload = await buildAgentKnowledgePayload(organization_id, req.body || {});

        const { data, error } = await supabase
            .from('bot_agents')
            .insert({
                organization_id,
                name,
                description,
                model,
                temperature,
                trigger_keywords,
                system_prompt,
                knowledge_base: knowledgePayload.knowledge_base,
                knowledge_base_content: knowledgePayload.knowledge_base_content,
                is_active
            })
            .select()
            .single();

        if (error) {
            // Check if table doesn't exist
            if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
                console.error('bot_agents table does not exist. Please run the migration.');
                return res.status(500).json({ 
                    error: 'Database table "bot_agents" not found. Please run the migration first.' 
                });
            }
            throw error;
        }

        res.status(201).json(data);
    } catch (err: any) {
        console.error('Error creating agent:', err);
        res.status(500).json({ error: err.message || 'Failed to create agent' });
    }
});

// Update a bot agent
app.patch('/api/agents/:id', authMiddleware, async (req: any, res) => {
    const { id } = req.params;
    const organization_id = req.organization_id;

    try {
        const updateData: any = {};
        const allowedFields = ['name', 'description', 'model', 'temperature', 'trigger_keywords', 'system_prompt', 'is_active'];

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        }

        if (
            req.body.selected_knowledge_document_ids !== undefined ||
            req.body.knowledge_base !== undefined ||
            req.body.knowledge_base_content !== undefined ||
            req.body.automation_settings !== undefined
        ) {
            const knowledgePayload = await buildAgentKnowledgePayload(organization_id, req.body || {});
            updateData.knowledge_base = knowledgePayload.knowledge_base;
            updateData.knowledge_base_content = knowledgePayload.knowledge_base_content;
        }

        let query = supabase
            .from('bot_agents')
            .update(updateData)
            .eq('id', id);

        if (organization_id) {
            query = query.eq('organization_id', organization_id);
        }

        const { data, error } = await query.select().single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Agent not found' });

        res.json(data);
    } catch (err: any) {
        console.error('Error updating agent:', err);
        res.status(500).json({ error: err.message || 'Failed to update agent' });
    }
});

// Delete a bot agent
app.delete('/api/agents/:id', authMiddleware, async (req: any, res) => {
    const { id } = req.params;
    const organization_id = req.organization_id;

    try {
        let query = supabase
            .from('bot_agents')
            .delete()
            .eq('id', id);

        if (organization_id) {
            query = query.eq('organization_id', organization_id);
        }

        const { error } = await query;

        if (error) throw error;

        res.json({ success: true });
    } catch (err: any) {
        console.error('Error deleting agent:', err);
        res.status(500).json({ error: err.message || 'Failed to delete agent' });
    }
});

// Toggle AI-agent fallback for a specific conversation. Flow Builder remains active.
app.patch('/api/conversations/:id/bot', authMiddleware, async (req: any, res) => {
    const { id } = req.params;
    const orgId = req.organization_id;
    const { bot_enabled, assigned_bot_id } = req.body;

    try {
        const updateData: any = {};
        if (typeof bot_enabled === 'boolean') {
            updateData.bot_enabled = bot_enabled;
        }
        if (assigned_bot_id !== undefined) {
            updateData.assigned_bot_id = assigned_bot_id || null;
        }

        const { data, error } = await supabase
            .from('w_conversations')
            .update(updateData)
            .eq('id', id)
            .eq('organization_id', orgId)
            .select('id, bot_enabled, assigned_bot_id')
            .maybeSingle();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Conversation not found' });

        io.to(`org:${orgId}`).emit('conversation_bot_updated', { conversation_id: id, ...data });
        res.json(data);
    } catch (err: any) {
        console.error('Error updating conversation bot settings:', err);
        res.status(500).json({ error: err.message || 'Failed to update bot settings' });
    }
});

// Get OpenAI settings
app.get('/api/settings/openai', authMiddleware, async (req: any, res) => {
    const organization_id = req.organization_id;

    try {
        if (!organization_id) {
            return res.status(400).json({ error: 'organization_id is required' });
        }

        const { data, error } = await supabase
            .from('openai_settings')
            .select('id, organization_id, created_at, updated_at')
            .eq('organization_id', organization_id)
            .maybeSingle();

        if (error) throw error;

        res.json({ 
            configured: !!data,
            hasEnvKey: !!process.env.OPENAI_API_KEY
        });
    } catch (err: any) {
        console.error('Error fetching OpenAI settings:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch settings' });
    }
});

// Save OpenAI API key
app.post('/api/settings/openai', authMiddleware, async (req: any, res) => {
    const organization_id = req.organization_id;
    const { api_key } = req.body;

    try {
        if (!organization_id) {
            return res.status(400).json({ error: 'organization_id is required' });
        }

        if (!api_key) {
            return res.status(400).json({ error: 'API key is required' });
        }

        // In production, encrypt this key before storing
        const { data, error } = await supabase
            .from('openai_settings')
            .upsert({
                organization_id,
                api_key_encrypted: api_key, // TODO: Encrypt this!
                updated_at: new Date().toISOString()
            }, { onConflict: 'organization_id' })
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true });
    } catch (err: any) {
        console.error('Error saving OpenAI settings:', err);
        res.status(500).json({ error: err.message || 'Failed to save settings' });
    }
});

// Get Auto Assign settings
app.get('/api/settings/auto-assign', authMiddleware, async (req: any, res) => {
    const organization_id = req.organization_id;

    try {
        const { data, error } = await supabase
            .from('organizations')
            .select('settings')
            .eq('id', organization_id)
            .single();

        if (error) throw error;

        const autoAssignSettings = data?.settings?.auto_assign || {
            enabled: false,
            batch_size: 1,
            paused_agents: [],
            state: { last_agent_id: null, current_batch_count: 0 }
        };

        res.json(autoAssignSettings);
    } catch (err: any) {
        console.error('Error fetching auto assign settings:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch settings' });
    }
});

// Update Auto Assign settings
app.post('/api/settings/auto-assign', authMiddleware, async (req: any, res) => {
    const organization_id = req.organization_id;
    const { enabled, batch_size, paused_agents } = req.body;

    try {
        const { data: orgData, error: fetchErr } = await supabase
            .from('organizations')
            .select('settings')
            .eq('id', organization_id)
            .single();

        if (fetchErr) throw fetchErr;

        const currentSettings = orgData?.settings || {};
        const currentAutoAssign = currentSettings.auto_assign || {};

        const newAutoAssign = {
            ...currentAutoAssign,
            enabled: enabled !== undefined ? enabled : currentAutoAssign.enabled || false,
            batch_size: batch_size !== undefined ? Math.max(1, batch_size) : currentAutoAssign.batch_size || 1,
            paused_agents: paused_agents !== undefined ? paused_agents : currentAutoAssign.paused_agents || []
        };

        const { data, error } = await supabase
            .from('organizations')
            .update({ settings: { ...currentSettings, auto_assign: newAutoAssign } })
            .eq('id', organization_id)
            .select('settings')
            .single();

        if (error) throw error;

        res.json(data.settings.auto_assign);
    } catch (err: any) {
        console.error('Error updating auto assign settings:', err);
        res.status(500).json({ error: err.message || 'Failed to update settings' });
    }
});

// Get organization agents for the UI
app.get('/api/team/agents', authMiddleware, async (req: any, res) => {
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
});

app.get("/api/messages/:conversationId", authMiddleware, async (req: any, res) => {
    const { conversationId } = req.params;
    const orgId = req.organization_id;
    try {
        const rawLimit = Number(req.query.limit || 50);
        const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, rawLimit)) : 50;
        const before = typeof req.query.before === 'string' ? req.query.before : null;

        // Fetch newest first for efficient pagination, then reverse to keep UI stable ASC.
        let query = supabase
            .from('w_messages')
            .select("*")
            .eq("conversation_id", conversationId)
            .eq("organization_id", orgId)
            .order("created_at", { ascending: false })
            .limit(limit);

        if (before) {
            // Expect ISO timestamp string
            query = query.lt('created_at', before);
        }

        const { data, error } = await query;

        if (error) throw error;
        const rows = Array.isArray(data) ? [...data].reverse() : [];
        res.json(rows);
    } catch (err: any) {
        console.error("Error fetching messages:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/conversations/:id/summary', authMiddleware, async (req: any, res) => {
    const conversationId = req.params.id;
    const orgId = req.organization_id;
    try {
        const { data: conversation, error: convErr } = await supabase
            .from('w_conversations')
            .select('id, handoff_status, handoff_reason, handoff_requested_at, summary_status, latest_summary_id')
            .eq('id', conversationId)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (convErr) throw convErr;
        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

        const { data: summary, error: summaryErr } = await supabase
            .from('w_conversation_summaries')
            .select('*')
            .eq('conversation_id', conversationId)
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (summaryErr) throw summaryErr;

        res.json({ conversation, summary: summary || null });
    } catch (err: any) {
        console.error('Error fetching conversation summary:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch summary' });
    }
});

app.post('/api/n8n/conversations/:conversationId/summary', async (req: any, res) => {
    const conversationId = String(req.params.conversationId || '').trim();
    const providedSecret = String(req.headers['x-n8n-secret'] || req.body?.secret || '');

    if (N8N_WEBHOOK_SECRET && providedSecret !== N8N_WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Invalid n8n secret' });
    }

    try {
        const { data: conversation, error: convErr } = await supabase
            .from('w_conversations')
            .select('id, organization_id')
            .eq('id', conversationId)
            .maybeSingle();
        if (convErr) throw convErr;
        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

        const body = req.body || {};
        const summaryText = String(body.summary_text || body.summary || body.conversation_summary || '').trim();
        if (!summaryText) return res.status(400).json({ error: 'summary_text is required' });

        const asArray = (value: any) => {
            if (Array.isArray(value)) return value;
            if (value == null || value === '') return [];
            return [value];
        };

        const { data: inserted, error: insertErr } = await supabase
            .from('w_conversation_summaries')
            .insert({
                organization_id: conversation.organization_id,
                conversation_id: conversationId,
                summary_text: summaryText,
                customer_intent: body.customer_intent || body.intent || null,
                customer_stage: body.customer_stage || body.stage || null,
                lead_quality: body.lead_quality || body.quality || null,
                next_best_action: body.next_best_action || body.next_action || null,
                open_questions: asArray(body.open_questions),
                important_facts: asArray(body.important_facts || body.key_facts),
                objections: asArray(body.objections),
                products_discussed: asArray(body.products_discussed || body.products),
                summary_from_message_id: body.summary_from_message_id || null,
                summary_to_message_id: body.summary_to_message_id || null,
                generated_by: body.generated_by || 'n8n',
                model: body.model || null,
                metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
            })
            .select()
            .single();
        if (insertErr) throw insertErr;

        await supabase
            .from('w_conversations')
            .update({
                latest_summary_id: inserted.id,
                summary_status: 'ready',
            })
            .eq('id', conversationId)
            .eq('organization_id', conversation.organization_id);

        await supabase
            .from('w_conversation_notes')
            .insert({
                organization_id: conversation.organization_id,
                conversation_id: conversationId,
                note_type: 'ai_summary',
                body: summaryText,
                source: 'n8n',
                metadata: { summary_id: inserted.id },
            });

        io.to(`org:${conversation.organization_id}`).emit('conversation_summary_updated', {
            conversation_id: conversationId,
            summary: inserted,
            summary_status: 'ready',
        });

        res.json({ success: true, summary: inserted });
    } catch (err: any) {
        console.error('[n8n] Error saving summary:', err);
        res.status(500).json({ error: err.message || 'Failed to save summary' });
    }
});

// Alias for required route shape
app.get('/api/conversations/:id/messages', authMiddleware, async (req: any, res) => {
    const conversationId = req.params.id;
    const orgId = req.organization_id;
    try {
        const rawLimit = Number(req.query.limit || 50);
        const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, rawLimit)) : 50;
        const before = typeof req.query.before === 'string' ? req.query.before : null;

        let query = supabase
            .from('w_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (before) {
            query = query.lt('created_at', before);
        }

        const { data, error } = await query;
        if (error) throw error;

        const rows = Array.isArray(data) ? [...data].reverse() : [];
        res.json(rows);
    } catch (err: any) {
        console.error('Error fetching conversation messages:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/messages/:messageId/reaction', authMiddleware, async (req: any, res) => {
    const { messageId } = req.params;
    const orgId = req.organization_id;
    const rawEmoji = typeof req.body?.emoji === 'string' ? req.body.emoji.trim() : null;
    const emoji = rawEmoji || null;
    const actor = req.user?.id || req.user?.email || 'dashboard';

    try {
        const { data: message, error: msgErr } = await supabase
            .from('w_messages')
            .select('id, organization_id, conversation_id, wa_message_id, reactions')
            .eq('id', messageId)
            .eq('organization_id', orgId)
            .single();

        if (msgErr) throw msgErr;
        if (!message) return res.status(404).json({ error: 'Message not found' });
        if (!message.wa_message_id) return res.status(400).json({ error: 'This message cannot be reacted to yet. WhatsApp message id is missing.' });

        const { data: conv, error: convErr } = await supabase
            .from('w_conversations')
            .select(`
                id,
                organization_id,
                contact:w_contacts(id, wa_id, phone),
                account:w_wa_accounts(id, phone_number_id, access_token_encrypted)
            `)
            .eq('id', message.conversation_id)
            .eq('organization_id', orgId)
            .single();

        if (convErr) throw convErr;
        if (!conv?.contact?.wa_id && !conv?.contact?.phone) {
            return res.status(400).json({ error: 'Conversation contact is missing phone number' });
        }
        if (!conv?.account?.phone_number_id) {
            return res.status(400).json({ error: 'Conversation account is missing phone number id' });
        }

        const nextReactions = applyReactionUpdate(message.reactions, emoji, actor);
        const toMeta = normalizeWaIdToPhone(String(conv.contact.wa_id || conv.contact.phone || ''));
        if (!toMeta) return res.status(400).json({ error: 'Invalid recipient phone number' });

        if (conv.account.access_token_encrypted) {
            await sendReactionMessage(toMeta, message.wa_message_id, emoji, String(conv.account.phone_number_id));
        } else {
            return res.status(409).json({ error: 'Reactions are currently available for Cloud API connected accounts.' });
        }

        const { error: updErr } = await supabase
            .from('w_messages')
            .update({ reactions: nextReactions })
            .eq('id', message.id)
            .eq('organization_id', orgId);

        if (updErr) throw updErr;

        io.emit('message_updated', {
            conversation_id: message.conversation_id,
            message_id: message.id,
            wa_message_id: message.wa_message_id,
            reactions: nextReactions,
        });

        res.json({ success: true, reactions: nextReactions });
    } catch (err: any) {
        console.error('Reaction update error:', err);
        res.status(500).json({ error: err.message || 'Failed to update reaction' });
    }
});

// Send Message (Outbound) - used by LiveChat UI
app.post('/api/conversations/:conversationId/send', authMiddleware, async (req: any, res) => {
    const { conversationId } = req.params;
    const orgId = req.organization_id;
    const { text, session_id, reply_to_message_id, forward_from_message_id } = req.body as { text?: string; session_id?: string; reply_to_message_id?: string; forward_from_message_id?: string };

    if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });

    try {
        const { data: conv, error: convErr } = await supabase
            .from('w_conversations')
            .select(`
                id,
                organization_id,
                wa_account_id,
                contact:w_contacts(id, wa_id, name),
                account:w_wa_accounts(id, phone_number_id, access_token_encrypted)
            `)
            .eq('id', conversationId)
            .eq('organization_id', orgId)
            .single();

        if (convErr) throw convErr;
        if (!conv?.contact?.wa_id) throw new Error('Conversation contact missing wa_id');
        if (!conv?.account?.phone_number_id) throw new Error('Conversation account missing phone_number_id');

        if (!orgId) throw new Error('Organization not configured');

        const toPhone = String(conv.contact.wa_id);
        const accountPhoneOrId = String(conv.account.phone_number_id);

        // 1) Send via Meta Cloud API if token exists, otherwise via Baileys
        let sendResult: any = null;
        let wa_message_id: string | null = null;
        if (conv.account.access_token_encrypted) {
            const toMeta = normalizeWaIdToPhone(toPhone);
            if (!toMeta) throw new Error('Meta send requires a numeric recipient phone number');
            sendResult = await sendTextMessage(toMeta, text, accountPhoneOrId, reply_to_message_id || null); // sendTextMessage already decrypts internally
            wa_message_id = sendResult?.messages?.[0]?.id || null;
        } else {
            // Baileys
            const sock = session_id ? sessions.get(session_id) : null;
            let resolvedSock = sock;
            if (!resolvedSock) {
                // Fallback: try to find an active session whose connected phone matches this account
                for (const s of sessions.values()) {
                    const connectedJid = s?.user?.id || '';
                    const connectedPhone = connectedJid ? connectedJid.split(':')[0] : '';
                    if (connectedPhone && connectedPhone === accountPhoneOrId) {
                        resolvedSock = s;
                        break;
                    }
                }
            }

            if (!resolvedSock) {
                throw new Error('No active Baileys session found for this account. Reconnect via QR.');
            }

            // Bail out early if the session isn't fully connected yet.
            // This prevents Baileys internals from crashing when auth/user state is not ready.
            if (!resolvedSock?.user?.id) {
                return res.status(409).json({
                    error: 'WhatsApp session is not connected yet. Click Generate QR and connect, then try again.'
                });
            }

            const normalizeForBaileys = (raw: string) => {
                const v = String(raw || '').trim();
                if (!v) return null;
                if (v.includes('@')) return v;
                const digits = v.replace(/[^0-9]/g, '');
                if (!digits) return null;
                return `${digits}@s.whatsapp.net`;
            };

            const jid = normalizeForBaileys(toPhone);
            if (!jid) throw new Error('Invalid recipient wa_id for Baileys');
            sendResult = await resolvedSock.sendMessage(jid, { text });
            wa_message_id = sendResult?.key?.id || null;
        }

        let quotedMessage: any = null;
        if (reply_to_message_id) {
            const { data: quotedMsg } = await supabase
                .from('w_messages')
                .select('id, text_body, type, content, wa_message_id, direction')
                .eq('wa_message_id', reply_to_message_id)
                .maybeSingle();
            quotedMessage = {
                wa_message_id: reply_to_message_id,
                text: quotedMsg?.text_body || quotedMsg?.content?.text || null,
                type: quotedMsg?.type || 'text',
                direction: quotedMsg?.direction || null,
                found: !!quotedMsg,
            };
        }

        // 2) Store in DB (with wa_message_id so status updates can match)
        const stored = await storeMessage({
            organization_id: orgId,
            contact_id: conv.contact.id,
            conversation_id: conv.id,
            wa_message_id,
            direction: 'outbound',
            type: 'text',
            content: { text, quoted: quotedMessage, forwarded: !!forward_from_message_id },
            status: 'sent',
            sender_type: 'human_agent',
            sender_user_id: (req as any).user?.id || null,
            automation_source: 'manual',
        } as any);

        // 3) Update conversation preview/unread
        await upsertConversation(orgId, conv.wa_account_id, conv.contact.id, {
            direction: 'outbound',
            preview: text
        });

        // 4) Emit to frontend (minimal patch payload)
        io.emit('new_message', {
            from: toPhone,
            text,
            quoted: quotedMessage,
            sender: 'agent',
            conversation_id: conv.id,
            contact_id: conv.contact.id,
            message_id: stored?.id || null,
            wa_message_id,
            created_at: stored?.created_at || new Date().toISOString(),
            status: 'sent',
            content: { text, quoted: quotedMessage, forwarded: !!forward_from_message_id }
        });

        res.json({
            success: true,
            result: sendResult,
            message: {
                id: stored?.id || null,
                wa_message_id,
                created_at: stored?.created_at || null,
                conversation_id: conv.id,
                contact_id: conv.contact.id,
                direction: 'outbound',
                type: 'text',
                content: { text, quoted: quotedMessage, forwarded: !!forward_from_message_id },
                status: 'sent',
            }
        });
    } catch (err: any) {
        console.error('Send message error:', err);
        res.status(500).json({ error: err.message || 'Failed to send' });
    }
});

// Send Media (Outbound) - used by LiveChat UI (image/video/audio/document)
app.post('/api/conversations/:conversationId/send-media', upload.single('file'), async (req, res) => {
    const { conversationId } = req.params;
    const caption = String((req.body?.caption || '')).trim();
    const session_id = String(req.body?.session_id || '');
    const duration_seconds_raw = req.body?.duration_seconds;
    const duration_seconds = duration_seconds_raw != null && duration_seconds_raw !== '' ? Number(duration_seconds_raw) : null;
    const file = (req as any).file as Express.Multer.File | undefined;

    if (!file) return res.status(400).json({ error: 'file required' });

    try {
        const { data: conv, error: convErr } = await supabase
            .from('w_conversations')
            .select(`
                id,
                organization_id,
                wa_account_id,
                contact:w_contacts(id, wa_id, name, phone),
                account:w_wa_accounts(id, phone_number_id, access_token_encrypted)
            `)
            .eq('id', conversationId)
            .single();

        if (convErr) throw convErr;
        if (!conv?.contact?.wa_id) throw new Error('Conversation contact missing wa_id');
        if (!conv?.account?.phone_number_id) throw new Error('Conversation account missing phone_number_id');

        const orgId = conv.organization_id;
        if (!orgId) throw new Error('Organization not configured');

        const mimeType = file.mimetype || 'application/octet-stream';
        const fileName = file.originalname || 'file';

        // Store media in Supabase Storage (always)
        const uploaded = await uploadMediaToStorage({
            organization_id: orgId,
            conversation_id: conv.id,
            fileName,
            mimeType,
            buffer: file.buffer,
        });

        let msgType: 'image' | 'video' | 'audio' | 'document' = 'document';
        if (mimeType.startsWith('image/')) msgType = 'image';
        else if (mimeType.startsWith('video/')) msgType = 'video';
        else if (mimeType.startsWith('audio/')) msgType = 'audio';

        const preview = caption || (msgType === 'image' ? '[Image]' : msgType === 'video' ? '[Video]' : msgType === 'audio' ? '[Audio]' : '[Document]');

        let wa_message_id: string | null = null;
        let sendRaw: any = null;

        if (conv.account.access_token_encrypted) {
            const toMeta = normalizeWaIdToPhone(conv.contact.wa_id);
            if (!toMeta) throw new Error('Meta send requires a numeric recipient phone number');

            const token = conv.account.access_token_encrypted;
            const sent = await sendMediaMessageMeta({
                phone_number_id: String(conv.account.phone_number_id),
                to: toMeta,
                token,
                buffer: file.buffer,
                mimeType,
                fileName,
                type: msgType,
                caption: caption || undefined,
            });
            wa_message_id = sent.wa_message_id;
            sendRaw = sent.raw;
        } else {
            // Baileys
            const accountPhoneOrId = String(conv.account.phone_number_id);
            const sock = session_id ? sessions.get(session_id) : null;
            let resolvedSock = sock;
            if (!resolvedSock) {
                for (const s of sessions.values()) {
                    const connectedJid = s?.user?.id || '';
                    const connectedPhone = connectedJid ? connectedJid.split(':')[0] : '';
                    if (connectedPhone && connectedPhone === accountPhoneOrId) {
                        resolvedSock = s;
                        break;
                    }
                }
            }
            if (!resolvedSock) throw new Error('No active Baileys session found for this account. Reconnect via QR.');

            const jid = conv.contact.wa_id.includes('@') ? conv.contact.wa_id : `${conv.contact.wa_id}@s.whatsapp.net`;
            let result: any = null;
            if (msgType === 'image') result = await resolvedSock.sendMessage(jid, { image: file.buffer, caption: caption || undefined });
            else if (msgType === 'video') result = await resolvedSock.sendMessage(jid, { video: file.buffer, caption: caption || undefined });
            else if (msgType === 'audio') result = await resolvedSock.sendMessage(jid, { audio: file.buffer, mimetype: mimeType });
            else result = await resolvedSock.sendMessage(jid, { document: file.buffer, fileName, mimetype: mimeType, caption: caption || undefined });

            wa_message_id = result?.key?.id || null;
            sendRaw = result;
        }

        const stored = await storeMessage({
            organization_id: orgId,
            contact_id: conv.contact.id,
            conversation_id: conv.id,
            wa_message_id,
            direction: 'outbound',
            type: msgType,
            content: {
                text: caption || null,
                media_url: uploaded.publicUrl,
                mime_type: mimeType,
                file_name: fileName,
                size: file.size,
                duration_seconds: msgType === 'audio' && Number.isFinite(duration_seconds as any) ? Math.max(0, Math.round(duration_seconds as any)) : null,
                raw_send: sendRaw,
            },
            status: 'sent',
            sender_type: 'human_agent',
            sender_user_id: (req as any).user?.id || null,
            automation_source: 'manual',
        } as any);

        await upsertConversation(orgId, conv.wa_account_id, conv.contact.id, { direction: 'outbound', preview });

        io.emit('new_message', {
            from: conv.contact.wa_id,
            text: caption || preview,
            sender: 'agent',
            conversation_id: conv.id,
            contact_id: conv.contact.id,
            message_id: stored?.id || null,
            wa_message_id,
            created_at: stored?.created_at || new Date().toISOString(),
            type: msgType,
            media_url: uploaded.publicUrl,
            mime_type: mimeType,
            file_name: fileName,
            duration_seconds: msgType === 'audio' && Number.isFinite(duration_seconds as any) ? Math.max(0, Math.round(duration_seconds as any)) : undefined,
            status: 'sent',
        });

        res.json({
            success: true,
            wa_message_id,
            media_url: uploaded.publicUrl,
            message: {
                id: stored?.id || null,
                wa_message_id,
                created_at: stored?.created_at || null,
                conversation_id: conv.id,
                contact_id: conv.contact.id,
                direction: 'outbound',
                type: msgType,
                content: {
                    text: caption || null,
                    media_url: uploaded.publicUrl,
                    mime_type: mimeType,
                    file_name: fileName,
                    size: file.size,
                    duration_seconds: msgType === 'audio' && Number.isFinite(duration_seconds as any) ? Math.max(0, Math.round(duration_seconds as any)) : null,
                },
                status: 'sent',
            }
        });
    } catch (err: any) {
        console.error('Send media error:', err);
        res.status(500).json({ error: err.message || 'Failed to send media' });
    }
});

// Required API: POST /api/messages/audio
// Input: multipart/form-data { conversation_id, file, caption?, session_id?, duration_seconds? }
app.post('/api/messages/audio', upload.single('file'), async (req, res) => {
    const conversationId = String(req.body?.conversation_id || '').trim();
    const caption = String((req.body?.caption || '')).trim();
    const session_id = String(req.body?.session_id || '');
    const duration_seconds_raw = req.body?.duration_seconds;
    const duration_seconds = duration_seconds_raw != null && duration_seconds_raw !== '' ? Number(duration_seconds_raw) : null;
    const file = (req as any).file as Express.Multer.File | undefined;

    if (!conversationId) return res.status(400).json({ error: 'conversation_id required' });
    if (!file) return res.status(400).json({ error: 'file required' });

    try {
        const { data: conv, error: convErr } = await supabase
            .from('w_conversations')
            .select(`
                id,
                organization_id,
                wa_account_id,
                contact:w_contacts(id, wa_id, name, phone),
                account:w_wa_accounts(id, phone_number_id, access_token_encrypted)
            `)
            .eq('id', conversationId)
            .single();

        if (convErr) throw convErr;
        if (!conv?.contact?.wa_id) throw new Error('Conversation contact missing wa_id');
        if (!conv?.account?.phone_number_id) throw new Error('Conversation account missing phone_number_id');

        const orgId = conv.organization_id;
        if (!orgId) throw new Error('Organization not configured');

        const mimeType = file.mimetype || 'audio/ogg';
        const fileName = file.originalname || `audio-${crypto.randomUUID()}.ogg`;

        const uploaded = await uploadMediaToStorage({
            organization_id: orgId,
            conversation_id: conv.id,
            fileName,
            mimeType,
            buffer: file.buffer,
        });

        // Try to send out via WhatsApp (Meta if available, else Baileys)
        let wa_message_id: string | null = null;
        let sendRaw: any = null;

        if (conv.account.access_token_encrypted) {
            const toMeta = normalizeWaIdToPhone(conv.contact.wa_id);
            if (!toMeta) throw new Error('Meta send requires a numeric recipient phone number');

            const token = decryptToken(conv.account.access_token_encrypted);
            const sent = await sendMediaMessageMeta({
                phone_number_id: String(conv.account.phone_number_id),
                to: toMeta,
                token,
                buffer: file.buffer,
                mimeType,
                fileName,
                type: 'audio',
            });
            wa_message_id = sent.wa_message_id;
            sendRaw = sent.raw;
        } else {
            const accountPhoneOrId = String(conv.account.phone_number_id);
            const sock = session_id ? sessions.get(session_id) : null;
            let resolvedSock = sock;
            if (!resolvedSock) {
                for (const s of sessions.values()) {
                    const connectedJid = s?.user?.id || '';
                    const connectedPhone = connectedJid ? connectedJid.split(':')[0] : '';
                    if (connectedPhone && connectedPhone === accountPhoneOrId) {
                        resolvedSock = s;
                        break;
                    }
                }
            }
            if (!resolvedSock) throw new Error('No active Baileys session found for this account. Reconnect via QR.');

            const jid = conv.contact.wa_id.includes('@') ? conv.contact.wa_id : `${conv.contact.wa_id}@s.whatsapp.net`;
            const result = await resolvedSock.sendMessage(jid, { audio: file.buffer, mimetype: mimeType });
            wa_message_id = result?.key?.id || null;
            sendRaw = result;
        }

        const stored = await storeMessage({
            organization_id: orgId,
            contact_id: conv.contact.id,
            conversation_id: conv.id,
            wa_message_id,
            direction: 'outbound',
            type: 'audio',
            content: {
                text: caption || null,
                media_url: uploaded.publicUrl,
                mime_type: mimeType,
                file_name: fileName,
                size: file.size,
                duration_seconds: Number.isFinite(duration_seconds as any) ? Math.max(0, Math.round(duration_seconds as any)) : null,
                raw_send: sendRaw,
            },
            status: 'sent',
            sender_type: 'human_agent',
            sender_user_id: (req as any).user?.id || null,
            automation_source: 'manual',
        } as any);

        await upsertConversation(orgId, conv.wa_account_id, conv.contact.id, {
            direction: 'outbound',
            preview: caption || '[Audio]',
        });

        io.emit('new_message', {
            from: conv.contact.wa_id,
            text: caption || '[Audio]',
            sender: 'agent',
            conversation_id: conv.id,
            contact_id: conv.contact.id,
            message_id: stored?.id || null,
            wa_message_id,
            created_at: stored?.created_at || new Date().toISOString(),
            type: 'audio',
            media_url: uploaded.publicUrl,
            mime_type: mimeType,
            file_name: fileName,
            duration_seconds: Number.isFinite(duration_seconds as any) ? Math.max(0, Math.round(duration_seconds as any)) : undefined,
            status: 'sent',
        });

        res.json({
            success: true,
            message: {
                id: stored?.id || null,
                wa_message_id,
                created_at: stored?.created_at || null,
                conversation_id: conv.id,
                contact_id: conv.contact.id,
                direction: 'outbound',
                type: 'audio',
                text_body: caption || null,
                media_url: uploaded.publicUrl,
                media_mime: mimeType,
                media_size: file.size,
                duration_seconds: Number.isFinite(duration_seconds as any) ? Math.max(0, Math.round(duration_seconds as any)) : null,
                status: 'sent',
            },
        });
    } catch (err: any) {
        console.error('Audio upload error:', err);
        res.status(500).json({ error: err.message || 'Failed to send audio' });
    }
});

// Mark as Read (Multi-Agent)
app.post("/api/conversations/:id/read", async (req, res) => {
    const { id } = req.params;
    const { user_id } = req.body; // Passed from frontend

    // user_id is optional in dev/local setups; we still clear unread + mark messages read.

    try {
        // 1. Get the conversation to find the organization_id (security check/data integrity)
        const { data: conv, error: fetchErr } = await supabase
            .from('w_conversations')
            .select('organization_id, last_message_at') // Get last_message_at to possibly act as "message id" proxy or just use NOW()
            .eq('id', id)
            .single();

        if (fetchErr || !conv) throw new Error("Conversation not found");

        // 2. Upsert into conversation_reads when user_id is available
        if (user_id) {
            const { error } = await supabase
                .from('w_conversation_reads')
                .upsert({
                    conversation_id: id,
                    user_id: user_id,
                    last_read_at: new Date().toISOString()
                }, { onConflict: 'conversation_id,user_id' });

            if (error) throw error;
        }

        // Also clear unread badge + mark inbound messages as read (UI parity with WhatsApp-like behavior).
        await supabase
            .from('w_conversations')
            .update({ unread_count: 0 })
            .eq('id', id);

        await supabase
            .from('w_messages')
            .update({ status: 'read' })
            .eq('conversation_id', id)
            .in('direction', ['inbound', 'in'])
            .neq('status', 'read');

        res.json({ success: true });
    } catch (err: any) {
        console.error("Error marking read:", err);
        res.status(500).json({ error: err.message });
    }
});

// ====== WhatsApp Accounts & Meta API Connection ======

// Get list of connected accounts
app.get('/api/whatsapp/accounts', authMiddleware, async (req, res) => {
    const orgId = (req as any).organization_id;

    try {
        if (!orgId) throw new Error('No organization found');

        const { data, error } = await supabase
            .from('w_wa_accounts')
            .select('*')
            .eq('organization_id', orgId)
            .neq('status', 'disconnected')
            .order('created_at', { ascending: false });

        if (error) throw error;
        // Strip encrypted tokens from the API response for security
        const safeData = (data || []).map((acc: any) => {
            const { access_token_encrypted, ...safe } = acc;
            return safe;
        });
        res.json(safeData);
    } catch (err: any) {
        console.error('Error fetching accounts:', err);
        res.status(500).json({ error: err.message });
    }
});

// Add/Update Meta API Account
app.post('/api/whatsapp/accounts/meta', authMiddleware, async (req, res) => {
    const { phone_number_id, waba_id, access_token, display_phone_number, name } = req.body;
    const orgId = (req as any).organization_id;

    if (!phone_number_id || !access_token) {
        return res.status(400).json({ error: 'phone_number_id and access_token are required' });
    }

    try {
        if (!orgId) throw new Error('No organization found. Make sure your Supabase is configured correctly.');

        // Validate the token against Meta before saving
        const verifyUrl = `https://graph.facebook.com/v21.0/${String(phone_number_id).trim()}?fields=id,display_phone_number,verified_name&access_token=${String(access_token).trim()}`;
        const verifyRes = await fetch(verifyUrl);
        const verifyData: any = await verifyRes.json();
        if (verifyData.error) {
            return res.status(400).json({ error: `Meta API error: ${verifyData.error.message}` });
        }

        const tokenInspection = await inspectMetaTokenPermissions(String(access_token).trim());
        if (tokenInspection.checked && tokenInspection.missingScopes.length > 0) {
            return res.status(400).json({
                error: `This Meta token can access the phone number but cannot be used for sending. Missing permission(s): ${tokenInspection.missingScopes.join(', ')}. Generate a System User token with whatsapp_business_messaging and whatsapp_business_management.`
            });
        }
        if (tokenInspection.error) {
            console.warn('[whatsapp/accounts/meta] Could not inspect Meta token permissions:', tokenInspection.error);
        }

        const resolvedDisplayPhone = verifyData.display_phone_number || display_phone_number || null;
        const resolvedName = verifyData.verified_name || name || 'WhatsApp Business API';

        // Upsert the account (token is AES-256 encrypted before storage)
        const { data, error } = await supabase
            .from('w_wa_accounts')
            .upsert({
                organization_id: orgId,
                phone_number_id: String(phone_number_id).trim(),
                whatsapp_business_account_id: waba_id ? String(waba_id).trim() : null,
                access_token_encrypted: encryptToken(String(access_token).trim()),
                display_phone_number: resolvedDisplayPhone,
                name: resolvedName,
                status: 'connected'
            }, { onConflict: 'phone_number_id' })
            .select('*')
            .single();

        if (error) {
            console.error('Supabase upsert error:', error);
            throw new Error(error.message);
        }
        res.json({ success: true, account: data });
    } catch (err: any) {
        console.error('Error saving Meta account:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete account
app.delete('/api/whatsapp/accounts/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const orgId = (req as any).organization_id;
    try {
        const { error } = await supabase
            .from('w_wa_accounts')
            .update({ status: 'disconnected', access_token_encrypted: null })
            .eq('id', id)
            .eq('organization_id', orgId); // Ensure user can only delete their own accounts
            
        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/whatsapp/accounts/:id/diagnostics', authMiddleware, async (req: any, res) => {
    const { id } = req.params;
    const orgId = req.organization_id;

    try {
        const { data: account, error } = await supabase
            .from('w_wa_accounts')
            .select('id, organization_id, phone_number_id, whatsapp_business_account_id, access_token_encrypted, display_phone_number, name, status')
            .eq('id', id)
            .eq('organization_id', orgId)
            .maybeSingle();

        if (error) throw error;
        if (!account?.id) return res.status(404).json({ error: 'WhatsApp account not found' });

        res.json(await getMetaAccountDiagnostics(account));
    } catch (err: any) {
        console.error('WhatsApp account diagnostics error:', err);
        res.status(500).json({ error: err.message || 'Failed to inspect WhatsApp account' });
    }
});

app.get('/api/whatsapp/accounts/:id/business-profile', authMiddleware, async (req: any, res) => {
    const orgId = req.organization_id;
    const { id } = req.params;

    try {
        const account = await getOrgWhatsappAccount(id, orgId);
        if (!account?.id) return res.status(404).json({ error: 'WhatsApp account not found' });

        const { access_token_encrypted, ...safeAccount } = account;
        let profile: any = {};
        let profileError: string | null = null;

        try {
            profile = await fetchMetaBusinessProfile(account);
        } catch (err: any) {
            profileError = err.message || 'Failed to fetch profile from Meta';
        }

        res.json({
            account: safeAccount,
            profile,
            profile_error: profileError
        });
    } catch (err: any) {
        console.error('Business profile fetch error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch business profile' });
    }
});

app.patch('/api/whatsapp/accounts/:id/business-profile', authMiddleware, upload.single('profile_picture'), async (req: any, res) => {
    const orgId = req.organization_id;
    const { id } = req.params;

    try {
        const account = await getOrgWhatsappAccount(id, orgId);
        if (!account?.id) return res.status(404).json({ error: 'WhatsApp account not found' });

        const token = account.access_token_encrypted ? decryptToken(account.access_token_encrypted) : '';
        if (!token) return res.status(400).json({ error: 'Selected account is missing a Meta access token' });

        const localName = String(req.body.local_name || '').trim();
        if (localName && localName !== account.name) {
            const { error: nameErr } = await supabase
                .from('w_wa_accounts')
                .update({ name: localName })
                .eq('id', id)
                .eq('organization_id', orgId);
            if (nameErr) throw nameErr;
        }

        let profilePictureHandle: string | null = null;
        if (req.file) {
            if (!['image/jpeg', 'image/png'].includes(String(req.file.mimetype || ''))) {
                return res.status(400).json({ error: 'Profile picture must be a JPG or PNG image. WEBP is not accepted by Meta for WhatsApp profile pictures.' });
            }
            profilePictureHandle = await uploadMetaProfilePicture(req.file, token);
        }

        await updateMetaBusinessProfile(account, req.body, profilePictureHandle);

        const refreshedAccount = await getOrgWhatsappAccount(id, orgId);
        const profile = await fetchMetaBusinessProfile(refreshedAccount);
        const { access_token_encrypted, ...safeAccount } = refreshedAccount;

        res.json({
            success: true,
            account: safeAccount,
            profile
        });
    } catch (err: any) {
        console.error('Business profile update error:', err);
        res.status(500).json({ error: err.message || 'Failed to update business profile' });
    }
});

// ====== Templates API Connection ======

// Get list of templates
app.get('/api/whatsapp/templates', authMiddleware, async (req, res) => {
    const orgId = (req as any).organization_id;
    
    try {
        if (!orgId) throw new Error('No organization found');
        
        const { data: accounts } = await supabase
            .from('w_wa_accounts')
            .select('*')
            .eq('organization_id', orgId)
            .not('whatsapp_business_account_id', 'is', null);

        if (!accounts || accounts.length === 0) {
            return res.json([]); 
        }

        const account = accounts[0];
        const token = decryptToken(account.access_token_encrypted);
        const waba_id = account.whatsapp_business_account_id;

        const response = await fetch(`https://graph.facebook.com/v20.0/${waba_id}/message_templates`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const json = await response.json();
        
        if (!response.ok) {
            console.error('Meta API Error:', json);
            return res.status(response.status).json({ error: json.error?.message || 'Failed to fetch templates from Meta' });
        }
        res.json(json.data || []);
    } catch (err: any) {
        console.error('Error fetching templates:', err);
        res.status(500).json({ error: err.message });
    }
});

// Create Template
app.post('/api/whatsapp/templates', authMiddleware, upload.single('file'), async (req, res) => {
    const orgId = (req as any).organization_id;
    const { name, category, language, components } = req.body;
    const file = req.file;

    try {
        if (!orgId) throw new Error('No organization found');

        const { data: accounts } = await supabase
            .from('w_wa_accounts')
            .select('*')
            .eq('organization_id', orgId)
            .not('whatsapp_business_account_id', 'is', null);

        if (!accounts || accounts.length === 0) {
            return res.status(400).json({ error: 'No connected Meta account found' });
        }

        const account = accounts[0];
        const token = decryptToken(account.access_token_encrypted);
        const waba_id = account.whatsapp_business_account_id;
        const phone_id = account.phone_number_id;

        let parsedComponents = [];
        try {
            parsedComponents = JSON.parse(components || '[]');
        } catch(e) { 
            return res.status(400).json({ error: 'Invalid components format' });
        }

        if (file) {
            // Meta Resumable Upload API
            const initRes = await fetch(`https://graph.facebook.com/v20.0/${phone_id}/uploads?file_length=${file.size}&file_type=${file.mimetype}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            const initJson = await initRes.json();
            if (!initRes.ok) throw new Error(initJson.error?.message || 'Upload initialization failed');
            
            const uploadSessionId = initJson.id;

            const uploadRes = await fetch(`https://graph.facebook.com/v20.0/${uploadSessionId}`, {
                method: 'POST',
                headers: { 
                    Authorization: `OAuth ${token}`,
                    file_offset: '0'
                },
                body: file.buffer as any
            });
            const uploadJson = await uploadRes.json();
            if (!uploadRes.ok) throw new Error(uploadJson.error?.message || 'File upload failed');
            
            const handle = uploadJson.h;

            // Inject the handle into the HEADER component
            const headerObj = parsedComponents.find((c: any) => c.type === 'HEADER');
            if (headerObj && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerObj.format)) {
                headerObj.example = { header_handle: [handle] };
            }
        }

        const payload = { name, category, language, components: parsedComponents };

        const response = await fetch(`https://graph.facebook.com/v20.0/${waba_id}/message_templates`, {
            method: 'POST',
            headers: { 
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const json = await response.json();
        
        if (!response.ok) {
            console.error('Meta API Error:', json);
            return res.status(response.status).json({ error: json.error?.message || 'Template creation failed' });
        }
        res.json({ success: true, data: json });
    } catch (err: any) {
        console.error('Create Template Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete Template
app.delete('/api/whatsapp/templates/:name', authMiddleware, async (req, res) => {
    const orgId = (req as any).organization_id;
    const { name } = req.params;

    try {
        if (!orgId) throw new Error('No organization found');
        
        const { data: accounts } = await supabase
            .from('w_wa_accounts')
            .select('*')
            .eq('organization_id', orgId)
            .not('whatsapp_business_account_id', 'is', null);

        if (!accounts || accounts.length === 0) {
            return res.status(400).json({ error: 'No connected Meta account found' });
        }

        const account = accounts[0];
        const token = decryptToken(account.access_token_encrypted);
        const waba_id = account.whatsapp_business_account_id;

        const response = await fetch(`https://graph.facebook.com/v20.0/${waba_id}/message_templates?name=${name}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });
        const json = await response.json();
        
        if (!response.ok) {
            console.error('Meta API Error:', json);
            return res.status(response.status).json({ error: json.error?.message || 'Template deletion failed' });
        }
        res.json({ success: true });
    } catch (err: any) {
        console.error('Delete Template Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Dev utility: simulate a message without WhatsApp connectivity.
// Stores in DB and emits the same socket payload the UI consumes.
app.post('/api/dev/simulate-message', async (req, res) => {
    if (process.env.NODE_ENV === 'production') return res.status(404).end();

    const { conversation_id, text, sender } = req.body as {
        conversation_id?: string;
        text?: string;
        sender?: 'user' | 'agent';
    };

    if (!conversation_id) return res.status(400).json({ error: 'conversation_id required' });
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'text required' });

    try {
        const { data: conv, error: convErr } = await supabase
            .from('w_conversations')
            .select(`
                id,
                organization_id,
                wa_account_id,
                contact_id,
                contact:contacts(wa_id)
            `)
            .eq('id', conversation_id)
            .single();

        if (convErr) throw convErr;
        if (!conv) throw new Error('Conversation not found');

        const orgId = conv.organization_id || (await ensureDefaultOrganizationId());
        if (!orgId) throw new Error('Organization not configured');

        const resolvedSender = (sender === 'agent' || sender === 'user') ? sender : 'user';
        const direction: 'inbound' | 'outbound' = resolvedSender === 'agent' ? 'outbound' : 'inbound';
        const status: 'sent' | 'delivered' = direction === 'outbound' ? 'sent' : 'delivered';

        const stored = await storeMessage({
            organization_id: orgId,
            contact_id: conv.contact_id,
            conversation_id: conv.id,
            wa_message_id: null,
            direction,
            type: 'text',
            content: { text: String(text) },
            status,
            sender_type: direction === 'outbound' ? 'human_agent' : 'customer',
            sender_user_id: direction === 'outbound' ? ((req as any).user?.id || null) : null,
            automation_source: direction === 'outbound' ? 'manual' : 'webhook',
        });

        await upsertConversation(orgId, conv.wa_account_id, conv.contact_id, {
            direction,
            preview: String(text),
        });

        io.emit('new_message', {
            from: conv.contact?.wa_id || null,
            text: String(text),
            sender: resolvedSender,
            conversation_id: conv.id,
            contact_id: conv.contact_id,
            message_id: stored?.id || null,
            wa_message_id: stored?.wa_message_id || null,
            created_at: stored?.created_at || new Date().toISOString(),
            status,
        });

        res.json({ success: true, message_id: stored?.id || null });
    } catch (err: any) {
        console.error('Simulate message error:', err);
        res.status(500).json({ error: err.message || 'Failed to simulate message' });
    }
});

// ====== Webhook Receiver (POST) ======
app.post("/webhook", async (req, res) => {
    // Signature verify (recommended)
    if (APP_SECRET) {
        const ok = verifyMetaSignature(req);
        if (!ok) {
            console.log("❌ Webhook Signature Verification Failed!");
            return res.sendStatus(403);
        }
    }
    res.sendStatus(200); // Ack immediately

    console.log("==========================================");
    console.log("📥 WEBHOOK EVENT RECEIVED!");
    console.log(JSON.stringify(req.body, null, 2));
    console.log("==========================================");

    try {
        const body = req.body;
        const entry = body?.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;
        const metadata = value?.metadata; // has phone_number_id

        if (!value) return;

        // 1. Identify Organization & Account
        const phone_number_id = metadata?.phone_number_id;
        let organization_id = null;
        let wa_account_id = null;

        if (phone_number_id && supabase) {
            const { data: acc } = await supabase
                .from('w_wa_accounts')
                .select('id, organization_id')
                .eq('phone_number_id', phone_number_id)
                .maybeSingle();

            if (acc) {
                organization_id = acc.organization_id;
                wa_account_id = acc.id;
            }
        }

        if (!organization_id) {
            console.error(`❌ Webhook Error: Phone ID ${phone_number_id} not mapped to any organization.`);
            return;
        }

        // 2. Handle Messages (Inbound)
        if (value.messages?.length) {
            const msg = value.messages[0];
            const contacts = value.contacts || [];

            const from = msg.from; // wa_id
            const profileName = contacts[0]?.profile?.name || null;
            const wa_message_id = msg.id;

            let type = msg.type;
            let text = "";
            let interactivePayload: any = null; // button/list reply ka raw data

            if (type === 'reaction') {
                const targetWaId = msg.reaction?.message_id || null;
                const emoji = typeof msg.reaction?.emoji === 'string' ? msg.reaction.emoji.trim() : '';

                if (targetWaId) {
                    const { data: target, error: targetErr } = await supabase
                        .from('w_messages')
                        .select('id, conversation_id, reactions')
                        .eq('organization_id', organization_id)
                        .eq('wa_message_id', targetWaId)
                        .maybeSingle();

                    if (!targetErr && target) {
                        const nextReactions = applyReactionUpdate(target.reactions, emoji || null, from);
                        const { error: updErr } = await supabase
                            .from('w_messages')
                            .update({ reactions: nextReactions })
                            .eq('id', target.id)
                            .eq('organization_id', organization_id);

                        if (updErr) {
                            console.error('Failed to update Cloud reaction', updErr);
                        } else {
                            io.to(`org:${organization_id}`).emit('message_updated', {
                                conversation_id: target.conversation_id,
                                message_id: target.id,
                                wa_message_id: targetWaId,
                                reactions: nextReactions,
                            });
                        }
                    }
                }
                return;
            }

            // REPLACED: Updated type extraction logic for interactive/buttons
            if (type === 'text') {
                text = msg.text?.body || '';
            } else if (type === 'interactive') {
                interactivePayload = msg.interactive;
                text = (msg.interactive?.button_reply?.title || 
                        msg.interactive?.list_reply?.title || 
                        msg.interactive?.button_reply?.id || 
                        msg.interactive?.list_reply?.id || 
                        `[interactive:${msg.interactive.type}]`);
            } else if (type === 'button') {
                text = msg.button?.text || '';
            } else if (type === 'image') {
                text = msg.image?.caption || '[Image]';
            } else if (type === 'video') {
                text = msg.video?.caption || '[Video]';
            } else if (type === 'audio') {
                text = '[Audio]';
            } else if (type === 'document') {
                text = msg.document?.filename || '[Document]';
            } else {
                text = `[${type}]`;
            }

            // Ensure wa_account exists so conversations FK/unique constraints work
            if (!wa_account_id && phone_number_id && supabase) {
                const { data: newAcc } = await supabase.from('w_wa_accounts').upsert({
                    organization_id,
                    phone_number_id,
                    display_phone_number: metadata?.display_phone_number || phone_number_id,
                    access_token_encrypted: ACCESS_TOKEN ? encryptToken(ACCESS_TOKEN) : '',
                    status: 'connected'
                }, { onConflict: 'phone_number_id' }).select('id').single();
                wa_account_id = newAcc?.id || null;
            }

            // A. Upsert Contact
            const contact = await upsertContact(organization_id, wa_account_id, from, profileName);

            // B. Upsert Conversation
            const conv = await upsertConversation(organization_id, wa_account_id, contact.id, {
                direction: 'inbound',
                preview: text
            });

            // Quoted/Reply context extract karo
            let quotedMessage: any = null;
            const isForwarded = !!(msg.context?.forwarded || msg.context?.frequently_forwarded);
            if (msg.context?.id) {
                // DB mein quoted message dhundo
                const { data: quotedMsg } = await supabase
                    .from('w_messages')
                    .select('id, text_body, type, content, wa_message_id, direction')
                    .eq('wa_message_id', msg.context.id)
                    .maybeSingle();

                quotedMessage = {
                    wa_message_id: msg.context.id,
                    from: msg.context.from || null,
                    // Agar DB mein mila toh uska text use karo
                    text: quotedMsg?.text_body 
                          || quotedMsg?.content?.text 
                          || null,
                    type: quotedMsg?.type || 'text',
                    direction: quotedMsg?.direction || null,
                    found: !!quotedMsg,
                };
            }

            // PRE-DEFINE CONTENT (Media will update this row later)
            const enrichedContent: any = { 
                text, 
                raw: msg,
                quoted: quotedMessage,
                forwarded: isForwarded,
                frequently_forwarded: !!msg.context?.frequently_forwarded,
            };

            // C. Insert Message
            const storedInbound = await storeMessage({
                organization_id,
                contact_id: contact.id,
                conversation_id: conv.id, // TS fix needed? Cast in storeMessage helper
                wa_message_id,
                direction: "inbound",
                type,
                content: enrichedContent,
                status: "delivered",
                sender_type: 'customer',
                automation_source: 'webhook',
            } as any);

            // D. Emit Realtime
            // Emit to org room
            io.to(`org:${organization_id}`).emit('new_message', {
                from,
                phone: from,
                text,
                quoted: quotedMessage || null,
                forwarded: isForwarded,
                sender: 'user',
                conversation_id: conv.id,
                contact_id: contact.id,
                message_id: storedInbound?.id || null,
                wa_message_id,
                created_at: storedInbound?.created_at || new Date().toISOString(),
                status: 'delivered',
                name: profileName,
                connectedAccount: metadata?.display_phone_number,
                type,
                ...(enrichedContent?.media_url ? { media_url: enrichedContent.media_url } : {}),
                ...(enrichedContent?.mime_type ? { mime_type: enrichedContent.mime_type } : {}),
                ...(enrichedContent?.file_name ? { file_name: enrichedContent.file_name } : {}),
            });

            // If media, download from Meta and store in Supabase Storage
            if (['image', 'video', 'audio', 'document'].includes(type)) {
                // RUN THIS ASYNC TO NOT BLOCK THE THREAD
                (async () => {
                    const mediaId =
                        type === 'image' ? msg.image?.id :
                            type === 'video' ? msg.video?.id :
                                type === 'audio' ? msg.audio?.id :
                                    type === 'document' ? msg.document?.id : null;

                    if (mediaId && phone_number_id) {
                        const downloaded = await downloadMetaMedia({ phone_number_id, mediaId });
                        if (downloaded) {
                            const uploaded = await uploadMediaToStorage({
                                organization_id,
                                conversation_id: conv.id,
                                fileName: downloaded.fileName,
                                mimeType: downloaded.mimeType,
                                buffer: downloaded.buffer,
                            });

                            const caption =
                                type === 'image' ? (msg.image?.caption || null) :
                                    type === 'video' ? (msg.video?.caption || null) :
                                        type === 'document' ? (msg.document?.caption || null) : null;

                            const finalMediaContent = {
                                text: caption,
                                media_url: uploaded.publicUrl,
                                mime_type: downloaded.mimeType,
                                file_name: downloaded.fileName,
                                quoted: quotedMessage,
                                forwarded: isForwarded,
                                frequently_forwarded: !!msg.context?.frequently_forwarded,
                                raw: msg,
                            };

                            // UPDATE THE MESSAGE CONTENT IN DB AFTER UPLOAD
                            if (storedInbound?.id) {
                                await supabase.from('w_messages').update({ content: finalMediaContent }).eq('id', storedInbound.id);
                                // EMIT UPDATE TO FRONTEND
                                io.emit("message_updated", {
                                    message_id: storedInbound.id,
                                    content: finalMediaContent
                                });
                            }
                        }
                    }
                })();
            }

            // E. Bot Auto-Reply
            try {
                let flowConsumedMessage = false;

                // Flow engine: text + button replies + interactive replies sab process karo
                const isFlowEligible = (type === 'text' || type === 'interactive' || type === 'button') && text;

                if (isFlowEligible) {
                    const flowResult = await processFlowEngine(organization_id, contact.id, conv.id, text, storedInbound?.id || null);
                    if (flowResult?.consumed) {
                        flowConsumedMessage = true;

                        // 1. Send preceding text output if present
                        if (flowResult.output) {
                            console.log(`🌊 Flow Engine replied with text to: "${text.substring(0, 50)}"`);
                            const sendResult = await sendTextMessage(from, flowResult.output, phone_number_id);
                            const botWaMessageId = sendResult?.messages?.[0]?.id || null;

                            const storedBotReply = await storeMessage({
                                organization_id, contact_id: contact.id, conversation_id: conv.id,
                                wa_message_id: botWaMessageId, direction: "outbound", type: "text",
                                content: { text: flowResult.output, is_flow: true }, status: "sent",
                                is_bot_reply: true,
                                sender_type: 'ai_agent',
                                automation_source: 'flow',
                                metadata: {
                                    flow_id: flowResult.flow_id,
                                    flow_version_id: flowResult.flow_version_id,
                                    flow_session_id: flowResult.flow_session_id,
                                    flow_run_id: flowResult.flow_run_id,
                                    flow_node_id: flowResult.flow_node_id,
                                    handoff: flowResult.handoff === true,
                                },
                            } as any);

                            io.emit("new_message", {
                                from: metadata?.display_phone_number || phone_number_id, phone: from, text: flowResult.output,
                                sender: 'agent', conversation_id: conv.id, contact_id: contact.id,
                                message_id: storedBotReply?.id || null,
                                wa_message_id: botWaMessageId,
                                created_at: storedBotReply?.created_at || new Date().toISOString(),
                                connectedAccount: metadata?.display_phone_number, type: 'text', is_bot_reply: true,
                            });
                        }

                        // 2. Send interactive buttons if present
                        if (flowResult.interactive?.type === 'button') {
                            console.log(`🔘 Flow Engine sending real buttons`);
                            const { body, buttons, footer } = flowResult.interactive;
                            const sendResult = await sendInteractiveButtons(from, body, buttons, footer, phone_number_id);
                            const botWaMessageId = sendResult?.messages?.[0]?.id || null;

                            const storedBotReply = await storeMessage({
                                organization_id, contact_id: contact.id, conversation_id: conv.id,
                                wa_message_id: botWaMessageId, direction: "outbound", type: "interactive",
                                content: { text: body, interactive: flowResult.interactive, is_flow: true }, status: "sent",
                                is_bot_reply: true,
                                sender_type: 'ai_agent',
                                automation_source: 'flow',
                                metadata: {
                                    flow_id: flowResult.flow_id,
                                    flow_version_id: flowResult.flow_version_id,
                                    flow_session_id: flowResult.flow_session_id,
                                    flow_run_id: flowResult.flow_run_id,
                                    flow_node_id: flowResult.flow_node_id,
                                    handoff: flowResult.handoff === true,
                                },
                            } as any);

                            io.emit("new_message", {
                                from: metadata?.display_phone_number || phone_number_id, phone: from, text: body,
                                sender: 'agent', conversation_id: conv.id, contact_id: contact.id,
                                message_id: storedBotReply?.id || null,
                                wa_message_id: botWaMessageId,
                                created_at: storedBotReply?.created_at || new Date().toISOString(),
                                connectedAccount: metadata?.display_phone_number, type: 'interactive', is_bot_reply: true,
                            });
                        }

                        // Update conversation preview
                        const lastPreview = flowResult.interactive?.body || flowResult.output || "";
                        await supabase.from('w_conversations').update({
                            last_message_at: new Date().toISOString(),
                            last_message_preview: lastPreview.substring(0, 100)
                        }).eq('id', conv.id);
                    }
                }

                // AI Agent fallback — sirf tab jab flow ne consume nahi kiya aur type text hai
                if (!flowConsumedMessage && type === 'text' && text) {
                    const botResult = await getBotAgentReply({ organization_id, conversation_id: conv.id, text });
                    if (botResult?.reply) {
                        console.log(`🤖 Bot "${botResult.agent?.name}" replying`);
                        const sendResult = await sendTextMessage(from, botResult.reply, phone_number_id);
                        const botWaMessageId = sendResult?.messages?.[0]?.id || null;
                        const storedBotReply = await storeMessage({
                            organization_id, contact_id: contact.id, conversation_id: conv.id,
                            wa_message_id: botWaMessageId, direction: "outbound", type: "text",
                            content: { text: botResult.reply, bot_agent_id: botResult.agent?.id },
                            status: "sent",
                            is_bot_reply: true,
                            bot_agent_id: botResult.agent?.id || null,
                            sender_type: 'ai_agent',
                            automation_source: 'ai_agent',
                        } as any);
                        io.emit("new_message", {
                            from: metadata?.display_phone_number || phone_number_id, phone: from, text: botResult.reply,
                            sender: 'agent', conversation_id: conv.id, contact_id: contact.id,
                            message_id: storedBotReply?.id || null, wa_message_id: botWaMessageId,
                            created_at: storedBotReply?.created_at || new Date().toISOString(),
                            connectedAccount: metadata?.display_phone_number, type: 'text', is_bot_reply: true,
                            bot_agent_name: botResult.agent?.name,
                        });

                        // Update conversation preview
                        await supabase
                            .from('w_conversations')
                            .update({
                                last_message_at: new Date().toISOString(),
                                last_message_preview: botResult.reply.substring(0, 100)
                            })
                            .eq('id', conv.id);
                    }
                }
            } catch (botErr: any) {
                console.error('Bot auto-reply error:', botErr.message || botErr);
            }
        }

        // 3. Handle Status Updates (Sent/Delivered/Read)
        if (value.statuses?.length) {
            const status = value.statuses[0];
            const wa_message_id = status.id;
            const newStatus = status.status; // sent, delivered, read

            // Update message status in DB
            await supabase.from('w_messages')
                .update({ status: newStatus })
                .eq('wa_message_id', wa_message_id);

            io.emit('message_status_update', { wa_message_id, status: newStatus });

            // If "read", maybe mark conversation as read? 
            // Usually "read" status on a message doesn't mean *we* read it, it means *user* read our message.
            // So we don't reset unread_count here.

            // Log event (optional)
            // await supabase.from('w_message_events').insert(...)
        }

    } catch (e: any) {
        console.error("Webhook Error:", e.message);
    }
});

// ====== Baileys Implementation ======

async function setupBaileys(sessionId: string, socket: any, orgIdFromRequest: string | null = null) {
    // CRITICAL FIX: Check concurrency lock
    if (initializingSessions.has(sessionId)) {
        console.log(`â³ Session ${sessionId} is already initializing. Skipping duplicate request.`);
        return;
    }

    // CRITICAL FIX: Check if session already exists to prevent multiple connections
    const existingSession = sessions.get(sessionId);
    if (existingSession) {
        console.log(`âš ï¸ Session ${sessionId} already active, reusing existing connection`);
        // Only report connected if we actually have a logged-in user on this socket.
        if (existingSession?.user?.id) socket.emit("status", "connected");
        else socket.emit("status", "connecting");

        // Emit info if available
        const connectedJid = existingSession.user?.id || "";
        const connectedAccount = connectedJid ? connectedJid.split(':')[0] : null;
        if (connectedAccount) socket.emit("connected_account", connectedAccount);

        return existingSession;
    }

    initializingSessions.add(sessionId);

    try {
        const sessionDir = `baileys_auth_info/${sessionId}`;
        const orgFile = `${sessionDir}/org_id.txt`;

        // Create dir if needed
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        // Persist/Resolve Organization ID
        let organization_id = orgIdFromRequest;
        if (!organization_id && fs.existsSync(orgFile)) {
            organization_id = fs.readFileSync(orgFile, 'utf8').trim();
        }

        if (organization_id) {
            fs.writeFileSync(orgFile, organization_id);
        } else {
            // Check if we can find it in socket data
            organization_id = socket?.data?.organization_id || null;
            if (organization_id) {
                fs.writeFileSync(orgFile, organization_id);
            }
        }

        if (!organization_id) {
            console.warn(`⚠️ Cannot initialize Baileys session ${sessionId} - No Organization ID provided or persisted.`);
            initializingSessions.delete(sessionId);
            return;
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`using WA v${version.join(".")}, isLatest: ${isLatest}`);

        // Create a logger that's silent to avoid noise
        const logger = pino({ level: 'silent' });

        // Store messages for retry mechanism (fixes "Waiting for this message" issue)
        const msgRetryCounterCache = new Map<string, number>();

        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                // Use cacheable signal key store for better encryption key management
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            // CRITICAL: Proper browser identification for multi-device
            browser: Browsers.ubuntu('Chrome'),
            // Enable history sync
            syncFullHistory: true,
            // Needed to receive events for messages sent by this logged-in account
            emitOwnEvents: true,
            // QR will be handled via socket.emit to frontend
            printQRInTerminal: false,
            // Prevent connection being marked as stale too quickly
            defaultQueryTimeoutMs: 60000,
            // Keep online to maintain encryption key sync
            markOnlineOnConnect: true,
            // Generate high-quality link preview
            generateHighQualityLinkPreview: true,
            // Retry message handling
            msgRetryCounterCache: msgRetryCounterCache as any,
            // CRITICAL: This callback is called when a message needs to be resent
            getMessage: async (key) => {
                // Try to get message from database if we stored it
                if (key.id) {
                    try {
                        const { data } = await supabase
                            .from('w_messages')
                            .select('content')
                            .eq('wa_message_id', key.id)
                            .maybeSingle();
                        if (data?.content?.text) {
                            return proto.Message.fromObject({ conversation: data.content.text });
                        }
                    } catch (e) {
                        console.log('getMessage lookup failed:', e);
                    }
                }
                // Return undefined to let Baileys handle it
                return undefined;
            },
            logger,
        });

        sock.ev.on("creds.update", saveCreds);

        // Keep a small cache for account id for this socket.
        let cachedWaAccountId: string | null = null;
        const resolveOrgAndAccount = async () => {
            if (cachedWaAccountId) return { orgId: organization_id!, waAccountId: cachedWaAccountId };

            const orgId = organization_id!;

            const myJid = sock.user?.id || "";
            const myPhone = myJid.split(':')[0];
            if (!myPhone) return { orgId, waAccountId: null as any };

            const { data: acc } = await supabase
                .from('w_wa_accounts')
                .select('id')
                .eq('phone_number_id', myPhone)
                .maybeSingle();

            let waAccountId = acc?.id || null;
            if (!waAccountId) {
                const { data: newAcc } = await supabase.from('w_wa_accounts').upsert({
                    organization_id: orgId,
                    phone_number_id: myPhone,
                    display_phone_number: myPhone,
                    status: 'connected'
                }, { onConflict: 'phone_number_id' }).select('id').single();
                waAccountId = newAcc?.id || null;
            }

            cachedWaAccountId = waAccountId;
            return { orgId, waAccountId };
        };

        // Persist contact names when Baileys provides them (notify/name/verifiedName).
        // This is the only reliable way to show names in the UI for Baileys sessions.
        const upsertBaileysContacts = async (contacts: any[]) => {
            try {
                if (!Array.isArray(contacts) || contacts.length === 0) return;

                const { orgId, waAccountId } = await resolveOrgAndAccount();
                if (!orgId || !waAccountId) return;

                for (const c of contacts) {
                    const jid = c?.id || c?.jid || c?.key || null;
                    const waId = normalizeContactWaIdForStorage(jid);
                    if (!waId) continue;

                    const name = pickBestBaileysContactName(c, waId);
                    if (!name) continue;

                    await upsertContact(orgId, waAccountId, waId, name);
                }
            } catch (err: any) {
                console.warn('âš ï¸ contacts sync failed:', err?.message || err);
            }
        };

        sock.ev.on('contacts.upsert', async (contacts: any[]) => {
            // Runs on initial sync and when new contacts are discovered.
            upsertBaileysContacts(contacts);
        });

        sock.ev.on('contacts.update', async (updates: any[]) => {
            // Runs when notify/name changes.
            upsertBaileysContacts(updates);
        });

        // âœ… NEW: Listen for incoming w_messages (new + history)
        sock.ev.on("messages.upsert", async ({ messages, type }) => {
            // type can be "notify" (new) or "append" (history sync)
            if (type !== "notify" && type !== "append") return;
            const isHistorySync = type === "append";

            console.log(`ðŸ“© messages.upsert type=${type} count=${messages?.length || 0}`);

            const orgId = await ensureDefaultOrganizationId();
            if (!orgId) return;

            const myJid = sock.user?.id || "";
            const myPhone = myJid.split(':')[0];

            // Resolve wa_account_id once per batch
            const { data: acc } = await supabase
                .from('w_wa_accounts')
                .select('id')
                .eq('phone_number_id', myPhone)
                .maybeSingle();

            let waAccountId = acc?.id;
            if (!waAccountId) {
                const { data: newAcc } = await supabase.from('w_wa_accounts').upsert({
                    organization_id: orgId,
                    phone_number_id: myPhone,
                    display_phone_number: myPhone,
                    status: 'connected'
                }, { onConflict: 'phone_number_id' }).select('id').single();
                waAccountId = newAcc?.id;
            }
            if (!waAccountId) return;

            for (const msg of messages) {
                try {
                    const isOutbound = msg.key.fromMe;
                    const remoteJid = msg.key.remoteJid || "";
                    if (!remoteJid) continue;

                    if (!isHistorySync) {
                        console.log(`   â†³ jid=${remoteJid} fromMe=${isOutbound} id=${msg.key.id || ''}`);
                    }

                    // Ignore status broadcast; keep groups and newsletters.
                    if (remoteJid === 'status@broadcast') continue;

                    const isGroup = remoteJid.endsWith('@g.us');
                    const isNewsletter = remoteJid.endsWith('@newsletter');

                    // For 1:1 store phone number only; for groups/newsletters store full JID.
                    const contactWaId = remoteJid.endsWith('@s.whatsapp.net')
                        ? remoteJid.split('@')[0]
                        : remoteJid;

                    const msgType = Object.keys(msg.message || {})[0] || '';
                    if (!msgType) continue;

                    let normalizedType: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' = 'text';
                    let captionText = '';
                    let previewText = '';

                    // Reactions must patch the target message, not render as a new bubble.
                    if (msgType === 'reactionMessage') {
                        const reaction = (msg.message as any)?.reactionMessage;
                        const targetWaId = reaction?.key?.id || null;
                        const emoji = typeof reaction?.text === 'string' ? reaction.text.trim() : '';
                        const from = String((msg.key as any)?.participant || (msg as any)?.participant || contactWaId || 'unknown');

                        if (targetWaId) {
                            const { data: target, error: targetErr } = await supabase
                                .from('w_messages')
                                .select('id, conversation_id, reactions')
                                .eq('wa_message_id', targetWaId)
                                .maybeSingle();

                            if (!targetErr && target) {
                                const nextReactions = applyReactionUpdate(target.reactions, emoji || null, from);
                                const { error: updErr } = await supabase
                                    .from('w_messages')
                                    .update({ reactions: nextReactions })
                                    .eq('id', target.id);

                                if (updErr) {
                                    console.error('Failed to update reactions (did you run the migration?)', updErr);
                                } else if (!isHistorySync) {
                                    io.emit('message_updated', {
                                        conversation_id: target.conversation_id,
                                        message_id: target.id,
                                        wa_message_id: targetWaId,
                                        reactions: nextReactions,
                                    });
                                }
                            }
                        }
                        continue;
                    }

                    // Protocol/system noise should never render as chat bubbles.
                    if (msgType === 'protocolMessage') {
                        continue;
                    }

                    if (msgType === 'conversation') {
                        captionText = msg.message?.conversation || '';
                        previewText = captionText;
                    } else if (msgType === 'extendedTextMessage') {
                        captionText = msg.message?.extendedTextMessage?.text || '';
                        previewText = captionText;
                    } else if (msgType === 'imageMessage') {
                        normalizedType = 'image';
                        captionText = msg.message?.imageMessage?.caption || '';
                        previewText = captionText || '[Image]';
                    } else if (msgType === 'videoMessage') {
                        normalizedType = 'video';
                        captionText = msg.message?.videoMessage?.caption || '';
                        previewText = captionText || '[Video]';
                    } else if (msgType === 'documentMessage') {
                        normalizedType = 'document';
                        const fileName = msg.message?.documentMessage?.fileName || '';
                        const docCaption = (msg.message as any)?.documentMessage?.caption || '';
                        captionText = docCaption;
                        previewText = docCaption || fileName || '[Document]';
                    } else if (msgType === 'audioMessage') {
                        normalizedType = 'audio';
                        captionText = '';
                        previewText = '[Audio]';
                    } else if (msgType === 'stickerMessage') {
                        normalizedType = 'sticker';
                        captionText = '';
                        previewText = '[Sticker]';
                    } else {
                        // Unknown/unsupported message types: ignore instead of persisting provider keys like [stickerMessage]
                        continue;
                    }

                    const contextInfo =
                        (msg.message as any)?.extendedTextMessage?.contextInfo ||
                        (msg.message as any)?.imageMessage?.contextInfo ||
                        (msg.message as any)?.videoMessage?.contextInfo ||
                        (msg.message as any)?.documentMessage?.contextInfo ||
                        (msg.message as any)?.audioMessage?.contextInfo ||
                        (msg.message as any)?.stickerMessage?.contextInfo ||
                        null;
                    const isForwarded = !!(contextInfo?.isForwarded || Number(contextInfo?.forwardingScore || 0) > 0);

                    // Thread name (group/channel)
                    let threadName: string | null = null;
                    if (isGroup) {
                        const cached = groupNameCache.get(remoteJid);
                        const isFresh = cached && (Date.now() - cached.fetchedAt) < GROUP_NAME_TTL_MS;
                        if (isFresh) {
                            threadName = cached!.subject;
                        } else {
                            try {
                                const meta = await sock.groupMetadata(remoteJid);
                                if (meta?.subject) {
                                    threadName = meta.subject;
                                    groupNameCache.set(remoteJid, { subject: meta.subject, fetchedAt: Date.now() });
                                }
                            } catch {
                                // ignore
                            }
                        }
                        if (!threadName) threadName = `Group ${remoteJid.split('@')[0]}`;
                    } else if (isNewsletter) {
                        threadName = `Channel ${remoteJid.split('@')[0]}`;
                    }

                    const senderName = isOutbound ? "You" : sanitizeContactDisplayName(msg.pushName || null, contactWaId);

                    // 1) Upsert Contact (this represents the thread for groups/newsletters too)
                    const contact = await upsertContact(
                        orgId,
                        waAccountId,
                        contactWaId,
                        threadName || (isOutbound ? null : senderName)
                    );

                    // 2) Upsert Conversation
                    const direction = isOutbound ? 'outbound' : 'inbound';
                    const conv = await upsertConversation(orgId, waAccountId, contact.id, {
                        direction,
                        preview: previewText
                    });

                    // 3) Store Message (download media when possible)
                    let enrichedContent: any = {
                        text: captionText || null,
                        rawType: msgType,
                        forwarded: isForwarded,
                        forwarding_score: Number(contextInfo?.forwardingScore || 0) || 0,
                    };
                    if (['image', 'video', 'document', 'audio', 'sticker'].includes(normalizedType) && msg.message) {
                        try {
                            let inner: any = null;
                            let streamType: any = null;
                            let mimeType = 'application/octet-stream';
                            let fileName = `${normalizedType}-${msg.key.id || crypto.randomUUID()}`;

                            if (msgType === 'imageMessage') {
                                inner = msg.message.imageMessage;
                                streamType = 'image';
                                mimeType = inner?.mimetype || 'image/jpeg';
                                fileName = `image-${msg.key.id || crypto.randomUUID()}.jpg`;
                            } else if (msgType === 'videoMessage') {
                                inner = msg.message.videoMessage;
                                streamType = 'video';
                                mimeType = inner?.mimetype || 'video/mp4';
                                fileName = `video-${msg.key.id || crypto.randomUUID()}.mp4`;
                            } else if (msgType === 'audioMessage') {
                                inner = msg.message.audioMessage;
                                streamType = 'audio';
                                mimeType = inner?.mimetype || 'audio/ogg';
                                fileName = `audio-${msg.key.id || crypto.randomUUID()}.ogg`;
                            } else if (msgType === 'documentMessage') {
                                inner = msg.message.documentMessage;
                                streamType = 'document';
                                mimeType = inner?.mimetype || 'application/octet-stream';
                                fileName = inner?.fileName || fileName;
                            } else if (msgType === 'stickerMessage') {
                                inner = (msg.message as any).stickerMessage;
                                streamType = 'sticker';
                                mimeType = inner?.mimetype || 'image/webp';
                                fileName = `sticker-${msg.key.id || crypto.randomUUID()}.webp`;
                            }

                            if (inner && streamType) {
                                const stream = await downloadContentFromMessage(inner, streamType);
                                const buffer = await streamToBuffer(stream);
                                const uploaded = await uploadMediaToStorage({
                                    organization_id: orgId,
                                    conversation_id: conv.id,
                                    fileName,
                                    mimeType,
                                    buffer,
                                });

                                enrichedContent = {
                                    text: captionText || null,
                                    media_url: uploaded.publicUrl,
                                    mime_type: mimeType,
                                    file_name: fileName,
                                    duration_seconds: msgType === 'audioMessage' && Number.isFinite(Number(inner?.seconds)) ? Number(inner.seconds) : null,
                                    rawType: msgType,
                                    forwarded: isForwarded,
                                    forwarding_score: Number(contextInfo?.forwardingScore || 0) || 0,
                                };
                            }
                        } catch {
                            // ignore download errors
                        }
                    }

                    const stored = await storeMessage({
                        organization_id: orgId,
                        contact_id: contact.id,
                        conversation_id: conv.id,
                        wa_message_id: msg.key.id || null,
                        direction,
                        type: normalizedType,
                        content: enrichedContent,
                        status: isOutbound ? 'sent' : 'delivered',
                        sender_type: isOutbound ? 'human_agent' : 'customer',
                        automation_source: isOutbound ? 'manual' : 'webhook',
                    });

                    // 4) Emit only realtime (not history sync)
                    if (!isHistorySync) {
                        io.emit("new_message", {
                            from: contactWaId,
                            name: threadName || senderName,
                            text: captionText,
                            forwarded: isForwarded,
                            type: normalizedType,
                            ...(enrichedContent?.media_url ? { media_url: enrichedContent.media_url } : {}),
                            ...(enrichedContent?.mime_type ? { mime_type: enrichedContent.mime_type } : {}),
                            ...(enrichedContent?.file_name ? { file_name: enrichedContent.file_name } : {}),
                            timestamp: new Date().toISOString(),
                            connectedAccount: myPhone,
                            contact_id: contact.id,
                            conversation_id: conv.id,
                            message_id: stored?.id || null,
                            wa_message_id: msg.key.id || null,
                            created_at: stored?.created_at || new Date().toISOString(),
                            sender: isOutbound ? 'agent' : 'user',
                            status: isOutbound ? 'sent' : 'delivered'
                        });

                        // Bot Auto-Reply for Baileys (only for inbound text messages)
                        if (!isOutbound && normalizedType === 'text' && captionText) {
                            try {
                                let flowConsumedMessage = false;
                                const flowResult = await processFlowEngine(orgId, contact.id, conv.id, captionText, stored?.id || null);
                                
                                if (flowResult?.consumed) {
                                    flowConsumedMessage = true;
                                    
                                    if (flowResult.output) {
                                        console.log(`ðŸŒŠ Flow Engine (Baileys) replying to: "${captionText.substring(0, 50)}..."`);
                                        const botMsg = await sock.sendMessage(remoteJid, { text: flowResult.output });
                                        const botWaMessageId = botMsg?.key?.id || null;
                                        
                                        const storedBotReply = await storeMessage({
                                            organization_id: orgId, contact_id: contact.id, conversation_id: conv.id,
                                            wa_message_id: botWaMessageId, direction: "outbound", type: "text",
                                            content: { text: flowResult.output, is_flow: true }, status: "sent",
                                            is_bot_reply: true,
                                            sender_type: 'ai_agent',
                                            automation_source: 'flow',
                                            metadata: {
                                                flow_id: flowResult.flow_id,
                                                flow_version_id: flowResult.flow_version_id,
                                                flow_session_id: flowResult.flow_session_id,
                                                flow_run_id: flowResult.flow_run_id,
                                                flow_node_id: flowResult.flow_node_id,
                                                handoff: flowResult.handoff === true,
                                            },
                                        } as any);
                                        
                                        io.emit("new_message", {
                                            from: myPhone, phone: contactWaId, text: flowResult.output,
                                            sender: 'agent', conversation_id: conv.id, contact_id: contact.id, message_id: storedBotReply?.id || null,
                                            wa_message_id: botWaMessageId, created_at: storedBotReply?.created_at || new Date().toISOString(),
                                            connectedAccount: myPhone, type: 'text', is_bot_reply: true,
                                        });

                                        await supabase.from('w_conversations').update({ last_message_at: new Date().toISOString(), last_message_preview: flowResult.output.substring(0, 100) }).eq('id', conv.id);
                                    }
                                }

                                if (!flowConsumedMessage) {
                                    const botResult = await getBotAgentReply({
                                        organization_id: orgId,
                                        conversation_id: conv.id,
                                        text: captionText
                                    });

                                    if (botResult?.reply) {
                                        console.log(`ðŸ¤– Bot "${botResult.agent?.name}" replying via Baileys to: "${captionText.substring(0, 50)}..."`);
                                    
                                    // Send the reply via Baileys
                                    const botMsg = await sock.sendMessage(remoteJid, { text: botResult.reply });
                                    const botWaMessageId = botMsg?.key?.id || null;

                                    // Store the bot's reply message
                                    const storedBotReply = await storeMessage({
                                        organization_id: orgId,
                                        contact_id: contact.id,
                                        conversation_id: conv.id,
                                        wa_message_id: botWaMessageId,
                                        direction: "outbound",
                                        type: "text",
                                        content: { text: botResult.reply, bot_agent_id: botResult.agent?.id },
                                        status: "sent",
                                        is_bot_reply: true,
                                        bot_agent_id: botResult.agent?.id || null,
                                        sender_type: 'ai_agent',
                                        automation_source: 'ai_agent',
                                    } as any);

                                    // Emit the bot reply to frontend
                                    io.emit("new_message", {
                                        from: myPhone,
                                        phone: contactWaId,
                                        text: botResult.reply,
                                        sender: 'agent',
                                        conversation_id: conv.id,
                                        contact_id: contact.id,
                                        message_id: storedBotReply?.id || null,
                                        wa_message_id: botWaMessageId,
                                        created_at: storedBotReply?.created_at || new Date().toISOString(),
                                        connectedAccount: myPhone,
                                        type: 'text',
                                        is_bot_reply: true,
                                        bot_agent_name: botResult.agent?.name,
                                    });

                                    // Update conversation preview
                                    await supabase
                                        .from('w_conversations')
                                        .update({
                                            last_message_at: new Date().toISOString(),
                                            last_message_preview: botResult.reply.substring(0, 100)
                                        })
                                        .eq('id', conv.id);
                                }
                                }
                            } catch (botErr: any) {
                                console.error('Bot auto-reply error (Baileys):', botErr.message || botErr);
                            }
                        }
                    }
                } catch (err) {
                    console.error("Error processing message:", err);
                }
            }
        });

        // âœ… NEW: Listen for status updates (Read Receipts / Delivery)
        sock.ev.on("messages.update", async (updates) => {
            for (const update of updates) {
                // update.update.status: 3=delivered, 4=read/played
                const statusRaw = update.update.status;
                if (!statusRaw) continue;

                let newStatus = null;
                if (statusRaw === 3) newStatus = 'delivered';
                else if (statusRaw >= 4) newStatus = 'read';

                if (newStatus && update.key.id) {
                    // Update DB
                        const orgId = await ensureDefaultOrganizationId();
                        if (orgId) {
                        await supabase.from('w_messages')
                            .update({ status: newStatus })
                            .eq('wa_message_id', update.key.id);
                    }

                    // Emit to frontend
                    io.emit("message_status_update", {
                        wa_message_id: update.key.id,
                        status: newStatus
                    });
                    console.log(`Updated status for ${update.key.id} -> ${newStatus}`);
                }
            }
        });

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                // Always cache QR, but only emit if the frontend explicitly requested it.
                latestQrBySession.set(sessionId, { qr, createdAt: Date.now() });

                const requested = Boolean(
                    socket?.data?.qrRequestedSessions &&
                    typeof socket.data.qrRequestedSessions?.has === 'function' &&
                    socket.data.qrRequestedSessions.has(sessionId)
                );

                if (requested) {
                    socket.emit("qr", qr);
                    console.log("QR Code sent to client");
                } else {
                    console.log("QR generated but not requested; cached for later");
                }
                initializingSessions.delete(sessionId); // Unlock on QR (user needs to scan)
            }

            if (connection === "close") {
                initializingSessions.delete(sessionId); // Unlock

                const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
                const error = (lastDisconnect?.error as any);
                const errorMsg = error?.message || "";

                // Check for critical session corruption errors
                const isBadSession =
                    statusCode === DisconnectReason.badSession ||
                    statusCode === DisconnectReason.connectionClosed || // Often means bad session state
                    statusCode === 428 || // Precondition Required (often Boom error)
                    errorMsg.includes("Bad MAC") ||
                    errorMsg.includes("pre-key") ||
                    errorMsg.includes("Connection Closed");

                if (isBadSession) {
                    console.error(`âŒ Critical Session Error (${statusCode || errorMsg}). Clearing session...`);
                    // Clear only THIS session directory to force fresh scan (not all sessions!)
                    try {
                        const sessionDir = `baileys_auth_info/${sessionId}`;
                        fs.rmSync(sessionDir, { recursive: true, force: true });
                        sessions.delete(sessionId);
                        socket.emit('status', 'ready'); // Ensure UI resets to QR generate state
                        socket.emit('session_cleared', { reason: errorMsg || 'Session corrupted' });
                        console.log(`âœ… Session ${sessionId} cleared. User must re-scan.`);
                    } catch (e) {
                        console.error("Failed to clear session:", e);
                    }
                    return; // Stop here
                }

                // CRITICAL FIX: Don't reconnect on conflict (440) or if logged out
                const shouldReconnect =
                    statusCode !== DisconnectReason.loggedOut &&
                    statusCode !== 440; // 440 = Stream Errored (conflict)

                console.log(
                    "connection closed due to ",
                    lastDisconnect?.error,
                    ", status code:",
                    statusCode,
                    ", reconnecting:",
                    shouldReconnect
                );

                // Remove from sessions map
                sessions.delete(sessionId);
                socket.emit('status', 'disconnected');

                if (shouldReconnect) {
                    // Get current attempt count
                    const attempts = reconnectAttempts.get(sessionId) || 0;
                    
                    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
                        console.log(`âŒ Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached for ${sessionId}. Stopping.`);
                        reconnectAttempts.delete(sessionId);
                        socket.emit('status', 'idle');
                        socket.emit('reconnect_failed', { reason: 'Max attempts reached. Please reconnect manually.' });
                        return;
                    }
                    
                    // Exponential backoff: 3s, 6s, 12s, 24s, 48s
                    const delay = 3000 * Math.pow(2, attempts);
                    reconnectAttempts.set(sessionId, attempts + 1);
                    
                    console.log(`â³ Reconnect attempt ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS} in ${delay/1000}s...`);
                    setTimeout(() => {
                        setupBaileys(sessionId, socket);
                    }, delay);
                } else {
                    console.log("âŒ Not reconnecting. User needs to scan QR again or logout detected.");
                    reconnectAttempts.delete(sessionId); // Reset on deliberate disconnect
                    if (statusCode === 440) {
                        console.log("âš ï¸ Conflict detected. Another WhatsApp Web session might be active.");
                        socket.emit('conflict_detected', { message: 'Another WhatsApp Web session is active. Close it and reconnect.' });
                    }
                    if (statusCode === DisconnectReason.loggedOut) {
                        // Clear session files on logout
                        try {
                            const sessionDir = `baileys_auth_info/${sessionId}`;
                            fs.rmSync(sessionDir, { recursive: true, force: true });
                            console.log(`âœ… Session ${sessionId} cleared after logout.`);
                        } catch (e) {
                            console.error("Failed to clear session on logout:", e);
                        }
                    }
                }
            } else if (connection === "open") {
                console.log("âœ… WhatsApp connection established successfully");
                initializingSessions.delete(sessionId); // Unlock
                reconnectAttempts.delete(sessionId); // Reset on successful connect
                socket.emit("status", "connected");

                // âœ… Emit connected account info immediately
                const connectedJid = sock.user?.id || "";
                const connectedAccount = connectedJid ? connectedJid.split(':')[0] : null;

                const orgId = await ensureDefaultOrganizationId();
                if (connectedAccount && orgId) {
                    // âœ… UPSERT into wa_accounts so we have a valid ID for FKs
                    try {
                        await supabase.from('w_wa_accounts').upsert({
                            organization_id: orgId,
                            phone_number_id: connectedAccount,
                            display_phone_number: connectedAccount, // Use phone as display name defaults
                            status: 'connected',
                            // waba_id: null // Not available in Baileys
                        }, { onConflict: 'phone_number_id' });
                        console.log(`âœ… Upserted wa_account for ${connectedAccount}`);
                    } catch (err) {
                        console.error("Failed to upsert wa_account:", err);
                    }
                }

                if (connectedAccount) {
                    socket.emit("connected_account", connectedAccount);
                }
            }
        });

        // Final Guard: If we're no longer in initializingSessions, it means we aborted or logged out mid-flow
        if (!initializingSessions.has(sessionId)) {
            console.log(`âš ï¸ Session ${sessionId} initialization aborted (likely logout). Not setting session.`);
            try { sock.end(undefined); } catch (e) {}
            return;
        }

        sessions.set(sessionId, sock);
        return sock;
    } catch (err) {
        console.error("Setup failed:", err);
        initializingSessions.delete(sessionId);
    }
}

// Global Error Handlers to prevent crash
process.on('uncaughtException', (err: any) => {
    console.error('âŒ Uncaught Exception:', err);
    // If it's the known connection crash, try to handle it
    if (err.message && (err.message.includes('Connection Closed') || err.message.includes('Bad MAC'))) {
        console.log("âš ï¸ Caught fatal session error. Cleaning up...");
        try {
            if (fs.existsSync('baileys_auth_info')) {
                fs.rmSync('baileys_auth_info', { recursive: true, force: true });
                console.log("âœ… Corrupted session cleared.");
            }
        } catch (e) { console.error("Cleanup failed:", e); }
    }
});

process.on('unhandledRejection', (reason: any, promise) => {
    console.error('âŒ Unhandled Rejection:', reason);
    if (reason && (reason.output?.statusCode === 428 || reason.message?.includes('Connection Closed'))) {
        console.log("âš ï¸ Caught Fatal Boom Error (428). Cleaning up session...");
        try {
            if (fs.existsSync('baileys_auth_info')) {
                fs.rmSync('baileys_auth_info', { recursive: true, force: true });
                console.log("âœ… Corrupted session cleared.");
            }
        } catch (e) { console.error("Cleanup failed:", e); }
    }
});

io.on("connection", (socket) => {
    console.log("✅ Frontend connected:", socket.id);

    // Join organization-specific room for multi-tenancy
    socket.on("join_org", (orgId: string) => {
        if (orgId) {
            console.log(`👤 Client ${socket.id} joining room: org:${orgId}`);
            socket.join(`org:${orgId}`);
        }
    });

    // Track explicit QR requests per socket.
    socket.data = socket.data || {};
    socket.data.qrRequestedSessions = socket.data.qrRequestedSessions || new Set<string>();

    // Frontend requests to join/init a session
    socket.on("join_session", async (sessionId: string) => {
        console.log(`Client ${socket.id} checking session ${sessionId}`);

        // Check if session exists in memory; if not, try restoring from disk.
        const existing = sessions.get(sessionId);
        if (existing && existing?.user?.id) {
            console.log(`âœ… Reusing existing session for ${sessionId}`);
            socket.emit("status", "connected");

            // âœ… Emit connected account info immediately
            const connectedJid = existing.user?.id || "";
            const connectedAccount = connectedJid ? connectedJid.split(':')[0] : null;
            if (connectedAccount) {
                socket.emit("connected_account", connectedAccount);
            }
        } else {
            if (existing && !existing?.user?.id) {
                console.log(`â„¹ï¸ Session ${sessionId} exists but not connected yet. Emitting scanning status.`);
                socket.emit("status", "scanning");
                
                // If a QR is already generated but connection isn't open, resend the QR
                const cached = latestQrBySession.get(sessionId);
                if (cached?.qr) {
                    socket.emit('qr', cached.qr);
                }
                return;
            }

            // If the session exists on disk (e.g. server restart), restore it.
            // QR may be generated by Baileys if creds are invalid, but QR emission is gated.
            try {
                const sessionDir = `baileys_auth_info/${sessionId}`;
                if (!sessions.get(sessionId) && fs.existsSync(sessionDir)) {
                    console.log(`ðŸ”„ Restoring Baileys session from disk: ${sessionId}`);
                    await setupBaileys(sessionId, socket);
                    return;
                }
            } catch {
                // ignore
            }

            console.log(`â„¹ï¸ No active connected session for ${sessionId}. Waiting for QR request...`);
            socket.emit("session_not_found"); // Trigger frontend to request QR
        }
    });

    // NEW: Explicit QR generation request
    socket.on("request_qr", async (sessionId: string, orgId?: string) => {
        console.log(`🔔 QR generation requested for session ${sessionId} (Org: ${orgId || 'None'})`);

        // Kill any existing session to ensure a clean slate for fresh QR
        const existing = sessions.get(sessionId);
        if (existing) {
            console.log(`âš ï¸ Killing existing session ${sessionId} to force fresh QR scan.`);
            try {
                existing.end(undefined);
            } catch (e) {}
            sessions.delete(sessionId);
            initializingSessions.delete(sessionId);
            reconnectAttempts.delete(sessionId);
            latestQrBySession.delete(sessionId);
        }

        socket.data.qrRequestedSessions.add(sessionId);

        // If we already have a cached QR for this session, emit it immediately.
        const cached = latestQrBySession.get(sessionId);
        if (cached?.qr) {
            socket.emit('qr', cached.qr);
        }

        // Create new Baileys session
        await setupBaileys(sessionId, socket, orgId || socket.data.organization_id);
    });

    // NEW: Explicit Logout request
    socket.on("logout", async (sessionId: string) => {
        console.log(`Logout requested for session ${sessionId}`);
        
        // Clear all tracking maps for this session
        initializingSessions.delete(sessionId); 
        reconnectAttempts.delete(sessionId);
        latestQrBySession.delete(sessionId);

        const sock = sessions.get(sessionId);
        let phoneToDisconnect = null;
        if (sock) {
            // Get phone before ending connection to update DB
            const jid = sock.user?.id || "";
            phoneToDisconnect = jid ? jid.split(':')[0] : null;

            try {
                // sock.logout() sends a message to WhatsApp to invalidate the session
                await sock.logout();
                sock.end(undefined);
            } catch (e) {
                console.error("Baileys logout error:", e);
            }
            sessions.delete(sessionId);
        }

        // Update database if we found a phone number
        if (phoneToDisconnect && supabase) {
            console.log(`Updating DB: Setting account ${phoneToDisconnect} to disconnected.`);
            try {
                await supabase.from('w_wa_accounts')
                    .update({ status: 'disconnected' })
                    .eq('phone_number_id', phoneToDisconnect);
            } catch (err) {
                console.error("Failed to update wa_account status on logout:", err);
            }
        }

        const sessionDir = `baileys_auth_info/${sessionId}`;
        if (fs.existsSync(sessionDir)) {
            // Delay to resolve file locks
            setTimeout(() => {
                try {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                    console.log(`âœ… Session directory ${sessionId} cleared on request. Chat data remains in DB.`);
                } catch (e) {}
            }, 500);
        }
        
        socket.emit("status", "ready");
    });

    socket.on("disconnect", () => console.log("âŒ Frontend disconnected:", socket.id));
});

httpServer.on('error', (err: any) => {
    if (err?.code === 'EADDRINUSE') {
        console.error(`âŒ Port ${PORT} is already in use.`);
        console.error('Close the other running server, or start with a different port.');
        console.error('Example (PowerShell): $env:PORT=3002; npm run dev');
        process.exit(1);
    }
    console.error('âŒ Server error:', err);
    process.exit(1);
});

// ====== Broadcast APIs ======

// GET /api/broadcast/tags
app.get('/api/broadcast/tags', authMiddleware, async (req, res) => {
    const orgId = (req as any).organization_id;
    try {
        const { data: contacts, error: fetchErr } = await supabase
            .from('w_contacts')
            .select('tags')
            .eq('organization_id', orgId);
            
        if (fetchErr) throw fetchErr;
        
        const tagsSet = new Set<string>();
        contacts?.forEach((c: any) => {
            if (Array.isArray(c.tags)) {
                c.tags.forEach((t: string) => tagsSet.add(t));
            }
        });
        
        res.json({ tags: Array.from(tagsSet) });
    } catch (err: any) {
        console.error('Fetch Tags Error:', err);
        res.status(500).json({ error: err.message });
    }
});

async function processCampaign(campaign: any) {
    try {
        const originalVariableMapping = campaign?.variable_mapping || {};
        const { data: freshCampaign, error: freshCampaignErr } = await supabase
            .from('w_campaigns')
            .select('*')
            .eq('id', campaign.id)
            .maybeSingle();

        if (freshCampaignErr) {
            console.warn('[processCampaign] Could not refetch campaign before processing:', freshCampaignErr.message);
        } else if (freshCampaign) {
            const freshMapping = freshCampaign.variable_mapping || {};
            const originalHeaderMedia = normalizeTemplateHeaderMedia(originalVariableMapping);
            const freshHeaderMedia = normalizeTemplateHeaderMedia(freshMapping);

            campaign = { ...campaign, ...freshCampaign };

            if (originalHeaderMedia.url && !freshHeaderMedia.url) {
                campaign.variable_mapping = {
                    ...freshMapping,
                    ...originalVariableMapping
                };
                console.warn('[processCampaign] DB campaign mapping was missing header media; using launch payload mapping', {
                    campaign_id: campaign.id,
                    template_name: campaign.template_name,
                    header_media_type: originalHeaderMedia.type,
                    header_media_url: originalHeaderMedia.url
                });
            }
        }

        await supabase.from('w_campaigns').update({ status: 'processing' }).eq('id', campaign.id);
        
        const orgId = campaign.organization_id;
        const wa_account_id = campaign.wa_account_id;
        
        const { data: account, error: accErr } = await supabase
            .from('w_wa_accounts')
            .select('id, phone_number_id, whatsapp_business_account_id, access_token_encrypted')
            .eq('id', wa_account_id)
            .single();

        if (accErr || !account) throw new Error('WhatsApp account not found');
        const token = decryptToken(account.access_token_encrypted);
        const phone_number_id = account.phone_number_id;

        let contactsToProcess = [];
        if (campaign.csv_data && Array.isArray(campaign.csv_data)) {
            contactsToProcess = campaign.csv_data;
        } else {
            let query = supabase
                .from('w_contacts')
                .select('id, name, custom_name, phone, wa_id, tags')
                .eq('organization_id', orgId)
                .eq('contact_type', 'individual');
                
            if (campaign.audience_tag) {
                query = query.contains('tags', [campaign.audience_tag]);
            }
            
            const { data: contacts, error: contactsErr } = await query;
            if (contactsErr) throw contactsErr;
            contactsToProcess = contacts || [];
        }
        
        if (contactsToProcess.length === 0) {
            await supabase.from('w_campaigns').update({ status: 'completed', total_contacts: 0 }).eq('id', campaign.id);
            return;
        }

        let sent = 0;
        let failed = 0;
        const results = [];

        for (const contact of contactsToProcess) {
            const recipient = contact.phone || contact.wa_id;
            if (!recipient) {
                failed++;
                results.push({ phone: null, name: contact.name || 'Unknown', status: 'failed', error: 'Missing phone number' });
                continue;
            }

            const components = [];
            const mapping = campaign.variable_mapping || {};
            
            let renderedText = mapping._template_body || `[Broadcast Template: ${campaign.template_name}]`;
            const parameters = [];
            const { type: headerMediaType, url: headerMediaUrl } = normalizeTemplateHeaderMedia(mapping);

            if (headerMediaType && !headerMediaUrl) {
                failed++;
                results.push({
                    phone: recipient,
                    name: contact.name || contact.custom_name || 'Unknown',
                    status: 'failed',
                    error: `Missing required ${headerMediaType} header media URL`
                });
                continue;
            }

            if (headerMediaType && headerMediaUrl) {
                components.push({
                    type: 'header',
                    parameters: [
                        {
                            type: headerMediaType,
                            [headerMediaType]: { link: headerMediaUrl }
                        }
                    ]
                });
            }

            const buttonUrlKeys = Object.keys(mapping)
                .map((key) => {
                    const match = key.match(/^_?button_url_(\d+)$/);
                    return match ? { key, index: match[1] } : null;
                })
                .filter(Boolean)
                .sort((a: any, b: any) => parseInt(a.index) - parseInt(b.index));

            const addedButtonIndexes = new Set<string>();
            for (const item of buttonUrlKeys as any[]) {
                if (addedButtonIndexes.has(item.index)) continue;
                const text = String(mapping[`_button_url_${item.index}`] || mapping[`button_url_${item.index}`] || '').trim();
                if (!text) continue;

                components.push({
                    type: 'button',
                    sub_type: 'url',
                    index: item.index,
                    parameters: [{ type: 'text', text }]
                });
                addedButtonIndexes.add(item.index);
            }

            const templateVariableKeys = Array.isArray(mapping._template_variables)
                ? mapping._template_variables.map((key: any) => String(key).trim()).filter(Boolean)
                : [...String(renderedText || '').matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(match => String(match[1] || '').trim()).filter(Boolean);
            const sortedKeys = [...new Set<string>(templateVariableKeys.length
                ? templateVariableKeys
                : Object.keys(mapping).filter(k => /^\d+$/.test(k)).sort((a, b) => parseInt(a) - parseInt(b)))];

            for (const key of sortedKeys) {
                const field = mapping[key];
                let text = '';
                if (field === 'name') text = contact.custom_name || contact.name || '';
                else if (field === 'phone') text = contact.phone || '';
                else text = field || ''; 
                
                renderedText = renderedText.replace(new RegExp(`\\{\\{\\s*${String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'g'), text);
                const parameter: any = { type: 'text', text: text || ' ' };
                if (!/^\d+$/.test(String(key))) {
                    parameter.parameter_name = String(key);
                }
                parameters.push(parameter);
            }

            if (parameters.length > 0) {
                components.push({ type: 'body', parameters });
            }

            const payload = {
                messaging_product: 'whatsapp',
                to: recipient,
                type: 'template',
                template: {
                    name: campaign.template_name,
                    language: { code: campaign.template_language },
                    components: components
                }
            };

            try {
                const response = await fetch(`https://graph.facebook.com/v21.0/${phone_number_id}/messages`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    sent++;
                    results.push({ phone: recipient, name: contact.name || contact.custom_name || 'Unknown', status: 'sent' });

                    const wa_message_id = data.messages?.[0]?.id;
                    const realWaId = data.contacts?.[0]?.wa_id || recipient;
                    
                    let currentContactId = contact.id;

                    if (!currentContactId) {
                        // First check if contact exists by real WhatsApp ID or the passed phone
                        const { data: existingContacts } = await supabase
                            .from('w_contacts')
                            .select('id')
                            .eq('organization_id', orgId)
                            .or(`wa_id.eq.${realWaId},phone.eq.${recipient}`)
                            .limit(1);

                        if (existingContacts && existingContacts.length > 0) {
                            currentContactId = existingContacts[0].id;
                        } else {
                            const { data: newContact, error: insertErr } = await supabase
                                .from('w_contacts')
                                .insert({
                                    organization_id: orgId,
                                    wa_account_id: wa_account_id,
                                    name: contact.name || contact.custom_name || recipient,
                                    phone: recipient,
                                    wa_id: realWaId,
                                    contact_type: 'individual'
                                })
                                .select('id')
                                .single();
                                
                            if (newContact) {
                                currentContactId = newContact.id;
                            }
                        }
                    }

                    if (currentContactId) {
                        const conv = await upsertConversation(orgId, wa_account_id, currentContactId, {
                            lastMessagePreview: `[Broadcast] ${campaign.template_name}`
                        });
                        
                        if (conv && conv.id) {
                            const templateButtons = Array.isArray(mapping._template_buttons)
                                ? mapping._template_buttons.map((button: any) => {
                                    const type = String(button?.type || '').toUpperCase();
                                    const buttonValue = mapping[`_button_url_${button.index}`] || mapping[`button_url_${button.index}`] || '';
                                    return {
                                        index: button.index,
                                        type,
                                        text: button?.text || `Button ${Number(button.index || 0) + 1}`,
                                        url: type === 'URL' ? resolveTemplateButtonUrl(button?.url, buttonValue) : '',
                                        phone_number: type === 'PHONE_NUMBER' ? (button?.phone_number || '') : ''
                                    };
                                }).filter((button: any) => button.text)
                                : [];

                            await storeMessage({
                                organization_id: orgId,
                                conversation_id: conv.id,
                                contact_id: currentContactId,
                                wa_message_id: wa_message_id || `broadcast-${Date.now()}`,
                                direction: 'outbound',
                                type: 'template',
                                status: 'sent',
                                content: {
                                    text: renderedText,
                                    template: {
                                        name: campaign.template_name,
                                        language: campaign.template_language,
                                        body: renderedText,
                                        footer: mapping._template_footer || '',
                                        header: headerMediaUrl ? {
                                            type: headerMediaType,
                                            media_url: headerMediaUrl
                                        } : null,
                                        buttons: templateButtons
                                    }
                                },
                                sender_type: 'system',
                                automation_source: 'broadcast',
                            });
                        }
                    }
                } else {
                    failed++;
                    console.error('[processCampaign] Meta template send failed', {
                        campaign_id: campaign.id,
                        template_name: campaign.template_name,
                        recipient,
                        error: data.error,
                        components: payload.template.components
                    });
                    results.push({ phone: recipient, name: contact.name || contact.custom_name || 'Unknown', status: 'failed', error: getMetaSendErrorMessage(data.error) });
                }
            } catch (e: any) {
                failed++;
                results.push({ phone: recipient, name: contact.name || contact.custom_name || 'Unknown', status: 'failed', error: e.message || 'Network/Unknown Error' });
            }
            
            await new Promise(r => setTimeout(r, 300));
        }

        await supabase.from('w_campaigns').update({ 
            status: 'completed', 
            total_contacts: contactsToProcess.length,
            sent_count: sent,
            failed_count: failed,
            results: results
        }).eq('id', campaign.id);

    } catch (err) {
        console.error('Error processing campaign:', campaign.id, err);
        await supabase.from('w_campaigns').update({ status: 'failed' }).eq('id', campaign.id);
    }
}

// Background scheduler
setInterval(async () => {
    try {
        const { data: campaigns, error } = await supabase
            .from('w_campaigns')
            .select('*')
            .eq('status', 'scheduled')
            .lte('scheduled_at', new Date().toISOString());

        if (error || !campaigns) return;
        
        for (const camp of campaigns) {
            processCampaign(camp); // runs asynchronously
        }
    } catch (e) {
        // ignore
    }
}, 60000); // Check every minute

// POST /api/broadcast/send
app.post('/api/broadcast/header-media', authMiddleware, upload.single('file'), async (req: any, res) => {
    const orgId = req.organization_id;
    const file = req.file;

    try {
        if (!orgId) {
            return res.status(400).json({ error: 'organization_id is required' });
        }
        if (!file) {
            return res.status(400).json({ error: 'File is required' });
        }

        const uploaded = await uploadMediaToStorage({
            organization_id: orgId,
            conversation_id: 'broadcast-template-headers',
            fileName: file.originalname || `template-header-${crypto.randomUUID()}`,
            mimeType: file.mimetype || 'application/octet-stream',
            buffer: file.buffer
        });

        res.json(uploaded);
    } catch (err: any) {
        console.error('Broadcast header media upload error:', err);
        res.status(500).json({ error: err.message || 'Failed to upload header media' });
    }
});

app.post('/api/broadcast/send', authMiddleware, async (req, res) => {
    const orgId = (req as any).organization_id;
    const {
        name,
        wa_account_id,
        audience_tag,
        csv_data,
        template_name,
        template_language,
        variable_mapping,
        scheduled_at,
        required_header_type,
        header_media_type,
        header_media_url
    } = req.body;
    
    try {
        if (!wa_account_id || !template_name || !template_language) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const variableMapping = variable_mapping && typeof variable_mapping === 'object' ? { ...variable_mapping } : {};
        if (header_media_url) {
            const mediaType = String(header_media_type || variableMapping.header_media_type || variableMapping._header_media_type || 'image').toLowerCase();
            variableMapping._header_media_type = mediaType;
            variableMapping._header_media_url = header_media_url;
            variableMapping.header_media_type = mediaType;
            variableMapping.header_media_url = header_media_url;
        }

        const requiredHeaderTypeFromClient = String(required_header_type || '').toLowerCase();
        if (['image', 'video', 'document'].includes(requiredHeaderTypeFromClient)) {
            const { type: headerMediaType, url: headerMediaUrl } = normalizeTemplateHeaderMedia(variableMapping, requiredHeaderTypeFromClient);
            if (!headerMediaUrl) {
                return res.status(400).json({
                    error: `Template "${template_name}" requires a ${requiredHeaderTypeFromClient} header media URL. Upload media or paste a public URL before launching.`
                });
            }

            variableMapping._header_media_type = requiredHeaderTypeFromClient;
            variableMapping._header_media_url = headerMediaUrl;
            variableMapping.header_media_type = requiredHeaderTypeFromClient;
            variableMapping.header_media_url = headerMediaUrl;
        }

        const { data: account, error: accountErr } = await supabase
            .from('w_wa_accounts')
            .select('id, phone_number_id, access_token_encrypted, whatsapp_business_account_id')
            .eq('id', wa_account_id)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (accountErr) throw accountErr;
        if (!account?.id) return res.status(400).json({ error: 'Selected WhatsApp account was not found' });
        if (!account.access_token_encrypted) return res.status(400).json({ error: 'Selected WhatsApp account is missing a Meta access token. Reconnect this account.' });

        const token = decryptToken(account.access_token_encrypted);
        const tokenInspection = await inspectMetaTokenPermissions(token);
        if (tokenInspection.checked && tokenInspection.missingScopes.length > 0) {
            return res.status(400).json({
                error: `Selected WhatsApp account token is missing required Meta permission(s): ${tokenInspection.missingScopes.join(', ')}. Reconnect using a System User or embedded signup token with whatsapp_business_messaging and whatsapp_business_management.`
            });
        }
        if (tokenInspection.error) {
            console.warn('[broadcast/send] Could not inspect Meta token permissions:', tokenInspection.error);
        }

        if (account.whatsapp_business_account_id) {
            const tplRes = await fetch(`https://graph.facebook.com/v20.0/${account.whatsapp_business_account_id}/message_templates?fields=name,language,status,components&limit=250`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const tplJson = await tplRes.json();
            if (!tplRes.ok) {
                return res.status(tplRes.status).json({ error: tplJson.error?.message || 'Failed to validate template before sending' });
            }

            const template = (tplJson.data || []).find((tpl: any) => tpl.name === template_name && (!template_language || tpl.language === template_language));
            if (!template) {
                return res.status(400).json({
                    error: `Could not validate template "${template_name}" before sending. Refresh templates and try again.`
                });
            }
            const header = template?.components?.find((component: any) => component.type === 'HEADER');
            const headerFormat = String(header?.format || '').toLowerCase();
            const body = template?.components?.find((component: any) => component.type === 'BODY');
            const footer = template?.components?.find((component: any) => component.type === 'FOOTER');
            const templateButtons = template?.components?.find((component: any) => component.type === 'BUTTONS')?.buttons || [];

            if (body?.text && !variableMapping._template_body) variableMapping._template_body = body.text;
            if (footer?.text) variableMapping._template_footer = footer.text;
            variableMapping._template_buttons = templateButtons
                .map((button: any, index: number) => ({
                    index,
                    type: button?.type || '',
                    text: button?.text || `Button ${index + 1}`,
                    url: button?.url || '',
                    phone_number: button?.phone_number || ''
                }))
                .filter((button: any) => button.text);

            if (['image', 'video', 'document'].includes(headerFormat)) {
                const { type: headerMediaType, url: headerMediaUrl } = normalizeTemplateHeaderMedia(variableMapping, headerFormat);
                if (headerMediaType !== headerFormat || !headerMediaUrl) {
                    return res.status(400).json({
                        error: `Template "${template_name}" requires a ${headerFormat} header media URL. Upload media or paste a public URL before launching.`
                    });
                }
                variableMapping._header_media_type = headerFormat;
                variableMapping._header_media_url = headerMediaUrl;
                variableMapping.header_media_type = headerFormat;
                variableMapping.header_media_url = headerMediaUrl;
            }

            const buttons = templateButtons;
            for (let index = 0; index < buttons.length; index++) {
                const button = buttons[index];
                const isDynamicUrlButton = String(button?.type || '').toUpperCase() === 'URL' && String(button?.url || '').includes('{{');
                if (!isDynamicUrlButton) continue;

                const rawButtonValue = variableMapping[`_button_url_${index}`] || variableMapping[`button_url_${index}`];
                const buttonValidation = validateDynamicUrlButtonValue(button.url, rawButtonValue);
                if (!buttonValidation.ok) {
                    return res.status(400).json({
                        error: `Template "${template_name}" has a dynamic URL button "${button.text || index + 1}". ${buttonValidation.error}`
                    });
                }

                const buttonValue = buttonValidation.value;
                variableMapping[`_button_url_${index}`] = buttonValue;
                variableMapping[`button_url_${index}`] = buttonValue;
            }
        }

        const isScheduled = scheduled_at && new Date(scheduled_at) > new Date();
        console.log('[broadcast/send] saving variable_mapping', {
            template_name,
            required_header_type,
            header_media_type,
            has_header_media_url: !!header_media_url,
            variableMapping
        });

        const { data: campaign, error: insertErr } = await supabase
            .from('w_campaigns')
            .insert({
                organization_id: orgId,
                wa_account_id,
                name: name || 'Untitled Campaign',
                audience_tag: audience_tag || null,
                csv_data: csv_data || null,
                template_name,
                template_language,
                variable_mapping: variableMapping,
                scheduled_at: scheduled_at || null,
                status: isScheduled ? 'scheduled' : 'processing'
            })
            .select()
            .single();

        if (insertErr) {
            console.error("Campaign insert error:", insertErr);
            throw new Error('Database Error: Have you run the w_campaigns SQL script in Supabase?');
        }

        const { data: persistedCampaign, error: mappingPersistErr } = await supabase
            .from('w_campaigns')
            .update({ variable_mapping: variableMapping })
            .eq('id', campaign.id)
            .select()
            .single();

        if (mappingPersistErr) {
            console.error('[broadcast/send] Failed to persist campaign variable_mapping after insert:', mappingPersistErr);
        }

        const campaignForProcessing = {
            ...(persistedCampaign || campaign),
            variable_mapping: variableMapping
        };

        console.log('[broadcast/send] persisted variable_mapping', {
            campaign_id: campaignForProcessing.id,
            saved_header_media_url: !!normalizeTemplateHeaderMedia(campaignForProcessing.variable_mapping).url,
            variable_mapping: campaignForProcessing.variable_mapping
        });

        if (!isScheduled) {
            // Process asynchronously without blocking response
            processCampaign(campaignForProcessing);
            res.json({ message: "Campaign processing started", campaign: campaignForProcessing, status: 'processing' });
        } else {
            res.json({ message: "Campaign scheduled successfully", campaign: campaignForProcessing, status: 'scheduled' });
        }

    } catch (err: any) {
        console.error('Broadcast Send Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/broadcast/campaigns
app.get('/api/broadcast/campaigns', authMiddleware, async (req, res) => {
    const orgId = (req as any).organization_id;
    try {
        const { data, error } = await supabase
            .from('w_campaigns')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        res.json({ campaigns: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/broadcast/campaigns/:id
app.delete('/api/broadcast/campaigns/:id', authMiddleware, async (req, res) => {
    const orgId = (req as any).organization_id;
    try {
        const { error } = await supabase
            .from('w_campaigns')
            .delete()
            .eq('id', req.params.id)
            .eq('organization_id', orgId)
            .eq('status', 'scheduled'); // Only allow deleting scheduled campaigns
            
        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

httpServer.listen(PORT, () => {
    console.log(`âœ… Server running on port ${PORT}`);
    // Check missing dirs
    if (!fs.existsSync("baileys_auth_info")) {
        fs.mkdirSync("baileys_auth_info");
    }
});
