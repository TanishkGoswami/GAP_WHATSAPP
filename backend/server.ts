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
import pino from "pino";

const app = express();
app.use(cors());

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
    cors: { origin: "*", methods: ["GET", "POST"] },
});

const PORT = Number(process.env.PORT || 3001);
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

const MEDIA_BUCKET = process.env.SUPABASE_MEDIA_BUCKET || 'wa-media';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

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

// ====== Auth Middleware (Supabase JWT) ======
async function authMiddleware(req: any, res: any, next: any) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized - missing token' });

    if (!supabase) return res.status(503).json({ error: 'Service unavailable - Supabase not configured' });

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
        console.error("Supabase Auth Error:", error?.message || error);
        return res.status(401).json({ error: 'Unauthorized - invalid or expired token' });
    }

    req.user = user;
    req.organization_id = user.user_metadata?.organization_id || null;
    next();
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

// For multi-org setup you should pass orgId from frontend/user auth.
// In dev, DEFAULT_ORG_ID can be omitted and we auto-create an org named "Default".
// If DEFAULT_ORG_ID is set to an invalid UUID or the all-zero placeholder, ignore it.
const RAW_DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID || null;
const DEFAULT_ORG_ID =
    RAW_DEFAULT_ORG_ID && isUuid(RAW_DEFAULT_ORG_ID) && !isAllZeroUuid(RAW_DEFAULT_ORG_ID)
        ? RAW_DEFAULT_ORG_ID
        : null;

if (RAW_DEFAULT_ORG_ID && !DEFAULT_ORG_ID) {
    console.warn(
        `âš ï¸ DEFAULT_ORG_ID is set but invalid/placeholder ('${RAW_DEFAULT_ORG_ID}'). ` +
        `Ignoring it and using/creating the "Default" organization.`
    );
}

// Runtime org fallback (dev convenience). If DEFAULT_ORG_ID isn't provided,
// we auto-create (or reuse) an organization named "Default".
let resolvedOrgId: string | null = DEFAULT_ORG_ID;
let resolvingOrgPromise: Promise<string | null> | null = null;

async function ensureDefaultOrganizationId(): Promise<string | null> {
    if (resolvedOrgId) return resolvedOrgId;
    if (!supabase) return null;
    if (resolvingOrgPromise) return resolvingOrgPromise;

    resolvingOrgPromise = (async () => {
        try {
            const { data: existing, error: findErr } = await supabase
                .from('organizations')
                .select('id')
                .eq('name', 'Default')
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle();

            if (findErr) throw findErr;
            if (existing?.id) {
                resolvedOrgId = existing.id;
                return resolvedOrgId;
            }

            const { data: created, error: createErr } = await supabase
                .from('organizations')
                .insert({ name: 'Default', slug: 'default' })
                .select('id')
                .single();

            if (createErr) throw createErr;

            resolvedOrgId = created?.id || null;
            console.log('âœ… Created default organization:', resolvedOrgId);
            return resolvedOrgId;
        } catch (err) {
            console.error('âŒ Failed to ensure default organization:', err);
            return null;
        } finally {
            resolvingOrgPromise = null;
        }
    })();

    return resolvingOrgPromise;
}

// Fire-and-forget bootstrap on startup
ensureDefaultOrganizationId().catch(() => undefined);

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

function formatIndianPhoneForDisplay(value: string | null | undefined): string {
    const key = normalizeIndianPhoneKey(value);
    if (!key) {
        const digits = normalizeWaIdToPhone(value);
        return digits ? digits : '';
    }
    return `+${key}`;
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
async function sendTextMessage(to: string, body: string, phone_number_id: string | null = null) {
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

    const payload = {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
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
        throw new Error(`Send failed: ${JSON.stringify(data)}`);
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
            .select('id,name,custom_name,phone,wa_id,wa_key,created_at')
            .eq('organization_id', organization_id)
            .eq('wa_key', wa_key);
        if (error) throw error;
        candidates = Array.isArray(data) ? data : [];
    }

    if (!candidates.length) {
        const { data, error } = await supabase
            .from('w_contacts')
            .select('id,name,custom_name,phone,wa_id,wa_key,created_at')
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

    if (existing?.id) {
        const updates: any = {
            last_active: nowIso,
        };

        if (wa_key && !existing.wa_key) updates.wa_key = wa_key;
        if (!existing.phone && maybePhone) updates.phone = maybePhone;
        if (safeName && isInvalidStoredContactName(existing.name, wa_id)) updates.name = safeName;

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

        io.emit('contact_updated', { contact: updated });
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
    io.emit('contact_updated', { contact: inserted });
    return inserted;
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
        return data;
    } else {
        const { data, error } = await supabase
            .from('w_conversations')
            .insert(payload)
            .select()
            .single();
        if (error) console.error("Conversation Insert Error:", error);
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
}) {
    const textBody = typeof params.content?.text === 'string' ? params.content.text : null;
    const mediaUrl = typeof params.content?.media_url === 'string' ? params.content.media_url : null;
    const mediaMime = typeof params.content?.mime_type === 'string' ? params.content.mime_type : null;
    const mediaSize = Number.isFinite(Number(params.content?.size)) ? Number(params.content.size) : null;
    const durationSeconds = Number.isFinite(Number(params.content?.duration_seconds)) ? Number(params.content.duration_seconds) : null;
    const waveform = params.content?.waveform ?? null;

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
        
        if (conv?.bot_enabled === false) return null; // Explicitly bypassed by UI toggle

        // If no bot enabled for this conversation, check for globally active bots
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

            // Find the first agent with matching keywords
            for (const agent of agents || []) {
                const keywords: string[] = agent.trigger_keywords || [];
                const hit = keywords.some((k: string) => normalized.includes(String(k).toLowerCase()));
                if (hit) {
                    targetAgent = agent;
                    break;
                }
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
        let knowledgeContext = '';
        if (targetAgent.knowledge_base_content && Array.isArray(targetAgent.knowledge_base_content)) {
            knowledgeContext = targetAgent.knowledge_base_content
                .map((item: any) => item?.content || '')
                .filter(Boolean)
                .join('\n\n');
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

// ====== Helper: Process Flow Engine ======
async function processFlowEngine(organization_id: string, contact_id: string, conversation_id: string, text: string): Promise<{consumed: boolean, output: string | null}> {
    const normalized = text.toLowerCase().trim();

    // 0. Respect Bot Toggle
    const { data: conv } = await supabase.from('w_conversations').select('bot_enabled').eq('id', conversation_id).single();
    if (conv?.bot_enabled === false) return { consumed: false, output: null };

    // 1. Check for active session
    const { data: session } = await supabase
        .from('w_flow_sessions')
        .select('*')
        .eq('organization_id', organization_id)
        .eq('contact_id', contact_id)
        .eq('status', 'active')
        .maybeSingle();

    let currentFlowId = null;
    let currentNodeId = null;
    let session_id = null;

    if (session) {
        currentFlowId = session.flow_id;
        currentNodeId = session.current_node_id;
        session_id = session.id;
    } else {
        // 2. Check for trigger matches in active flows
        const { data: activeFlows } = await supabase
            .from('w_flows')
            .select('*')
            .eq('organization_id', organization_id)
            .eq('status', 'active');

        let matchedFlow = null;
        for (const flow of activeFlows || []) {
            // Check flow-level triggers AND startBotFlow node keywords
            const flowTriggers = flow.triggers || [];
            const nodes = flow.nodes || [];
            const startNode = nodes.find((n: any) => n.type === 'startBotFlow');
            const nodeTriggers = startNode?.data?.config?.keywords
                ? String(startNode.data.config.keywords).split(',').map((k: string) => k.trim()).filter(Boolean)
                : [];
            const allTriggers = [...new Set([...flowTriggers, ...nodeTriggers])];

            if (allTriggers.some((t: string) => normalized.includes(t.toLowerCase()))) {
                matchedFlow = flow;
                break;
            }
        }

        if (!matchedFlow) return { consumed: false, output: null }; // Pass to AI Agent if no flow triggers

        currentFlowId = matchedFlow.id;
        // Find start node
        const nodes = matchedFlow.nodes || [];
        const startNode = nodes.find((n: any) => n.type === 'startBotFlow');
        if (!startNode) return { consumed: false, output: null };

        currentNodeId = startNode.id;

        // Create new session
        const { data: newSession, error: sessErr } = await supabase
            .from('w_flow_sessions')
            .upsert({
                organization_id, contact_id, flow_id: currentFlowId,
                current_node_id: currentNodeId, status: 'active'
            }, { onConflict: 'organization_id,contact_id' })
            .select().single();
            
        if (!sessErr && newSession) session_id = newSession.id;
    }

    if (!currentFlowId || !currentNodeId) return { consumed: false, output: null };

    // Execute Flow steps
    const { data: flow } = await supabase.from('w_flows').select('nodes, edges').eq('id', currentFlowId).single();
    if (!flow) return { consumed: true, output: null };

    const nodes = flow.nodes || [];
    const edges = flow.edges || [];

    let activeNode = nodes.find((n: any) => n.id === currentNodeId);
    let outputText = [];
    
    // Safety break for loop
    let steps = 0;
    while (activeNode && steps < 10) {
        steps++;
        
        // If it's a message node, collect text
        if (activeNode.type === 'textMessage') {
            const msg = activeNode.data?.config?.message || activeNode.data?.config?.text || activeNode.data?.label;
            if (msg) outputText.push(msg);
        } else if (activeNode.type === 'button') {
            const body = activeNode.data?.config?.headerText || activeNode.data?.config?.text || 'Choose an option:';
            const footer = activeNode.data?.config?.footerText ? `\n_${activeNode.data.config.footerText}_` : '';
            const btns = (activeNode.data?.config?.buttons || [])
                .filter((b: any) => b.text)
                .map((b: any, i: number) => `${i + 1}. ${b.text}`)
                .join('\n');
            outputText.push(`${body}\n\n${btns}${footer}`);
            // Wait for user input
            await supabase.from('w_flow_sessions').update({ current_node_id: activeNode.id }).eq('id', session_id);
            return { consumed: true, output: outputText.join('\n\n') };
        } else if (activeNode.type === 'template') {
            const templateName = activeNode.data?.config?.templateName;
            if (templateName) {
                // Template message Meta API se bhejo
                // For now log karo — template sending already sendTextMessage me handle hoti hai
                outputText.push(`[Template: ${templateName}]`);
            }
        } else if (activeNode.type === 'image' || activeNode.type === 'video' || activeNode.type === 'audio' || activeNode.type === 'file') {
            const url = activeNode.data?.config?.url || activeNode.data?.config?.customField;
            const caption = activeNode.data?.config?.caption || '';
            if (url) outputText.push(`[Media: ${url}${caption ? ' - ' + caption : ''}]`);
        } else if (activeNode.type === 'location') {
            const lat = activeNode.data?.config?.latitude;
            const lng = activeNode.data?.config?.longitude;
            if (lat && lng) outputText.push(`[Location: ${lat}, ${lng}]`);
        } else if (activeNode.type === 'userInput') {
            const q = activeNode.data?.config?.question || 'Please reply:';
            outputText.push(q);
            await supabase.from('w_flow_sessions').update({ current_node_id: activeNode.id }).eq('id', session_id);
            return { consumed: true, output: outputText.join('\n\n') };
        }

        // Advance to next node
        let nextEdge = null;
        if (session && steps === 1) {
            // Evaluated response from user
            const outEdges = edges.filter((e: any) => e.source === activeNode.id);
            if (outEdges.length === 1) {
                nextEdge = outEdges[0];
            } else {
                nextEdge = outEdges.find((e: any) => e.sourceHandle === normalized || e.label?.toLowerCase() === normalized) || outEdges[0];
            }
        } else {
            // Automatic advance without user input
            nextEdge = edges.find((e: any) => e.source === activeNode.id);
        }

        if (nextEdge) {
            activeNode = nodes.find((n: any) => n.id === nextEdge.target);
            // If we just traversed into a new Wait node dynamically, don't execute it, let the next while loop iteration execute it and pause
        } else {
            // End of flow
            await supabase.from('w_flow_sessions').update({ status: 'completed' }).eq('id', session_id);
            activeNode = null;
        }
    }

    return { 
        consumed: true, 
        output: outputText.length > 0 ? outputText.join('\n\n') : null 
    };
}

// ====== API Endpoints ======

app.get("/api/dashboard-stats", async (req, res) => {
    try {
        const organization_id = await ensureDefaultOrganizationId();
        
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
app.get("/api/conversations", async (req, res) => {
    // In a real app, use the authenticated user's organization_id
    const requestedOrgId = req.query.organization_id as string | undefined;
    const organization_id = requestedOrgId || (await ensureDefaultOrganizationId());
    const wa_account_id = req.query.wa_account_id as string; // Optional filter
    const user_id = req.query.user_id as string; // Current agent's ID

    // If still missing, fall back to returning conversations across orgs (dev mode).
    if (!organization_id) {
        console.warn("âš ï¸ No organization_id resolved; returning conversations without org filter (dev mode)");
    }

    try {
        const baseQuery = supabase
            .from('w_conversations')
            .select(`
                *,
                contact:w_contacts(id, name, custom_name, phone, wa_id, wa_key, created_at, tags)
            `)
            .order("last_message_at", { ascending: false });

        let query = baseQuery;

        // Only hard-filter by organization_id when the client explicitly asked for it.
        // Using a stale DEFAULT_ORG_ID is a common dev misconfig and makes the UI look empty.
        if (requestedOrgId) {
            query = query.eq("organization_id", requestedOrgId);
        } else if (organization_id) {
            query = query.eq("organization_id", organization_id);
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
                        `âš ï¸ wa_account_id filter '${wa_account_id}' could not be resolved to a wa_accounts.id. ` +
                        `Skipping account filter (dev mode).`
                    );
                }
            }
        }

        let { data: conversations, error } = await query;
        if (error) throw error;

        // Dev safety: if we filtered by resolvedOrgId (not explicitly requested) and got nothing,
        // retry without org filter so chats stored under a different org still show up.
        if (!requestedOrgId && organization_id && (conversations?.length || 0) === 0) {
            console.warn(
                `âš ï¸ No conversations found for organization_id=${organization_id}. ` +
                `Retrying without org filter (dev mode).`
            );
            const retry = await baseQuery;
            conversations = retry.data;
            if (retry.error) throw retry.error;
        }

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
                console.warn('âš ï¸ Failed to compute unread counts:', unreadErr.message || unreadErr);
            } else if (Array.isArray(unreadRows)) {
                for (const row of unreadRows) {
                    const cid = (row as any)?.conversation_id;
                    if (!cid) continue;
                    unreadCountMap.set(cid, (unreadCountMap.get(cid) || 0) + 1);
                }
            }
        }

        // Transform Data
        const result = conversations.map((c: any) => {
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
            }

            return {
                ...next,
                user_has_read: userHasRead,
                unread_for_user
            };
        });

        res.json(result);
    } catch (err: any) {
        console.error("Error fetching conversations:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/contacts', async (req, res) => {
    const requestedOrgId = req.query.organization_id as string | undefined;
    const organization_id = requestedOrgId || (await ensureDefaultOrganizationId());
    const includeGroups = req.query.include_groups === 'true';
    try {
        let baseQuery = supabase
            .from('w_contacts')
            .select('id, name, custom_name, phone, wa_id, wa_key, tags, created_at, last_active, contact_type')
            .order('created_at', { ascending: false });

        // By default, only show individual w_contacts (not groups/channels)
        if (!includeGroups) {
            baseQuery = baseQuery.or('contact_type.eq.individual,contact_type.is.null');

        }

        let query = baseQuery;
        if (requestedOrgId) query = query.eq('organization_id', requestedOrgId);
        else if (organization_id) query = query.eq('organization_id', organization_id);

        let { data, error } = await query;
        if (!requestedOrgId && organization_id && !error && (data?.length || 0) === 0) {
            console.warn(
                `âš ï¸ No contacts found for organization_id=${organization_id}. ` +
                `Retrying without org filter (dev mode).`
            );
            const retry = await baseQuery;
            data = retry.data;
            error = retry.error;
        }
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

app.patch('/api/contacts/:id', async (req, res) => {
    const contactId = req.params.id;
    const requestedOrgId = req.query.organization_id as string | undefined;
    const organization_id = requestedOrgId || resolvedOrgId;

    try {
        if (!organization_id) {
            return res.status(400).json({ error: 'organization_id is required' });
        }

        const raw = (req.body?.custom_name ?? null);
        const custom_name = typeof raw === 'string' ? raw.trim() : null;
        const normalizedCustomName = custom_name ? custom_name : null;

        const { data: existing, error: findErr } = await supabase
            .from('w_contacts')
            .select('id, organization_id, wa_key')
            .eq('id', contactId)
            .maybeSingle();
        if (findErr) throw findErr;
        if (!existing?.id) return res.status(404).json({ error: 'Contact not found' });
        if (existing.organization_id !== organization_id) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        // Apply to all duplicates sharing the same wa_key to keep UI consistent.
        if (existing.wa_key) {
            const { error: updAllErr } = await supabase
                .from('w_contacts')
                .update({ custom_name: normalizedCustomName })
                .eq('organization_id', organization_id)
                .eq('wa_key', existing.wa_key);
            if (updAllErr) throw updAllErr;
        }

        const { data: updated, error: updErr } = await supabase
            .from('w_contacts')
            .update({ custom_name: normalizedCustomName })
            .eq('id', contactId)
            .select('id, name, custom_name, phone, wa_id, wa_key, tags, created_at, last_active')
            .single();
        if (updErr) throw updErr;

        io.emit('contact_updated', { contact: updated });
        res.json(updated);
    } catch (err: any) {
        console.error('Error updating contact:', err);
        res.status(500).json({ error: err.message || 'Failed to update contact' });
    }
});

// ====== Flow Builder API ======
app.get('/api/flows', async (req, res) => {
    const orgId = req.query.organization_id as string || await ensureDefaultOrganizationId();
    try {
        const { data, error } = await supabase.from('w_flows').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch(e: any) { res.status(500).json({error: e.message}); }
});

app.post('/api/flows', async (req, res) => {
    const orgId = req.query.organization_id as string || await ensureDefaultOrganizationId();
    try {
        const payload = { ...req.body, organization_id: orgId };
        const { data, error } = await supabase.from('w_flows').insert(payload).select().single();
        if (error) throw error;
        res.status(201).json(data);
    } catch(e: any) { res.status(500).json({error: e.message}); }
});

app.put('/api/flows/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { id: _, created_at, ...updateData } = req.body;
        updateData.updated_at = new Date().toISOString();
        const { data, error } = await supabase.from('w_flows').update(updateData).eq('id', id).select().single();
        if (error) throw error;
        res.json(data);
    } catch(e: any) { res.status(500).json({error: e.message}); }
});

app.delete('/api/flows/:id', async (req, res) => {
    try {
        await supabase.from('w_flows').delete().eq('id', req.params.id);
        res.json({success: true});
    } catch(e: any) { res.status(500).json({error: e.message}); }
});

// ====== Bot Agents API ======
// Get all bot agents for an organization
app.get('/api/agents', async (req, res) => {
    const requestedOrgId = req.query.organization_id as string | undefined;
    const organization_id = requestedOrgId || (await ensureDefaultOrganizationId());

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
app.post('/api/agents', async (req, res) => {
    const requestedOrgId = req.query.organization_id as string | undefined;
    const organization_id = requestedOrgId || (await ensureDefaultOrganizationId());

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
            knowledge_base = [],
            knowledge_base_content = [],
            is_active = true
        } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Agent name is required' });
        }

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
                knowledge_base,
                knowledge_base_content,
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
app.patch('/api/agents/:id', async (req, res) => {
    const { id } = req.params;
    const requestedOrgId = req.query.organization_id as string | undefined;
    const organization_id = requestedOrgId || (await ensureDefaultOrganizationId());

    try {
        const updateData: any = {};
        const allowedFields = ['name', 'description', 'model', 'temperature', 'trigger_keywords', 'system_prompt', 'knowledge_base', 'knowledge_base_content', 'is_active'];

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
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
app.delete('/api/agents/:id', async (req, res) => {
    const { id } = req.params;
    const requestedOrgId = req.query.organization_id as string | undefined;
    const organization_id = requestedOrgId || (await ensureDefaultOrganizationId());

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

// Toggle bot for a specific conversation
app.patch('/api/conversations/:id/bot', async (req, res) => {
    const { id } = req.params;
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
            .select('id, bot_enabled, assigned_bot_id')
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Conversation not found' });

        io.emit('conversation_bot_updated', { conversation_id: id, ...data });
        res.json(data);
    } catch (err: any) {
        console.error('Error updating conversation bot settings:', err);
        res.status(500).json({ error: err.message || 'Failed to update bot settings' });
    }
});

// Get OpenAI settings
app.get('/api/settings/openai', async (req, res) => {
    const requestedOrgId = req.query.organization_id as string | undefined;
    const organization_id = requestedOrgId || (await ensureDefaultOrganizationId());

    try {
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
app.post('/api/settings/openai', async (req, res) => {
    const requestedOrgId = req.query.organization_id as string | undefined;
    const organization_id = requestedOrgId || (await ensureDefaultOrganizationId());
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

app.get("/api/messages/:conversationId", async (req, res) => {
    const { conversationId } = req.params;
    try {
        const rawLimit = Number(req.query.limit || 50);
        const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, rawLimit)) : 50;
        const before = typeof req.query.before === 'string' ? req.query.before : null;

        // Fetch newest first for efficient pagination, then reverse to keep UI stable ASC.
        let query = supabase
            .from('w_messages')
            .select("*")
            .eq("conversation_id", conversationId)
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

// Alias for required route shape
app.get('/api/conversations/:id/messages', async (req, res) => {
    const conversationId = req.params.id;
    try {
        const rawLimit = Number(req.query.limit || 50);
        const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, rawLimit)) : 50;
        const before = typeof req.query.before === 'string' ? req.query.before : null;

        let query = supabase
            .from('w_messages')
            .select('*')
            .eq('conversation_id', conversationId)
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

// Send Message (Outbound) - used by LiveChat UI
app.post('/api/conversations/:conversationId/send', async (req, res) => {
    const { conversationId } = req.params;
    const { text, session_id } = req.body as { text?: string; session_id?: string };

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
            .single();

        if (convErr) throw convErr;
        if (!conv?.contact?.wa_id) throw new Error('Conversation contact missing wa_id');
        if (!conv?.account?.phone_number_id) throw new Error('Conversation account missing phone_number_id');

        const orgId = conv.organization_id || (await ensureDefaultOrganizationId());
        if (!orgId) throw new Error('Organization not configured');

        const toPhone = String(conv.contact.wa_id);
        const accountPhoneOrId = String(conv.account.phone_number_id);

        // 1) Send via Meta Cloud API if token exists, otherwise via Baileys
        let sendResult: any = null;
        let wa_message_id: string | null = null;
        if (conv.account.access_token_encrypted) {
            const toMeta = normalizeWaIdToPhone(toPhone);
            if (!toMeta) throw new Error('Meta send requires a numeric recipient phone number');
            sendResult = await sendTextMessage(toMeta, text, accountPhoneOrId); // sendTextMessage already decrypts internally
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

        // 2) Store in DB (with wa_message_id so status updates can match)
        const stored = await storeMessage({
            organization_id: orgId,
            contact_id: conv.contact.id,
            conversation_id: conv.id,
            wa_message_id,
            direction: 'outbound',
            type: 'text',
            content: { text },
            status: 'sent'
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
            sender: 'agent',
            conversation_id: conv.id,
            contact_id: conv.contact.id,
            message_id: stored?.id || null,
            wa_message_id,
            created_at: stored?.created_at || new Date().toISOString(),
            status: 'sent'
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
                content: { text },
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

        const orgId = conv.organization_id || (await ensureDefaultOrganizationId());
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

        const orgId = conv.organization_id || (await ensureDefaultOrganizationId());
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
    const orgId = (req as any).organization_id || (await ensureDefaultOrganizationId());

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
    const orgId = (req as any).organization_id || (await ensureDefaultOrganizationId());

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
    const orgId = (req as any).organization_id || (await ensureDefaultOrganizationId());
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

// ====== Templates API Connection ======

// Get list of templates
app.get('/api/whatsapp/templates', authMiddleware, async (req, res) => {
    const orgId = (req as any).organization_id || (await ensureDefaultOrganizationId());
    
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
    const orgId = (req as any).organization_id || (await ensureDefaultOrganizationId());
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
    const orgId = (req as any).organization_id || (await ensureDefaultOrganizationId());
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
        let organization_id = resolvedOrgId;
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
            } else {
                console.warn(`âš ï¸ Phone ID ${phone_number_id} not found in wa_accounts. Using DEFAULT_ORG_ID.`);
            }
        }

        if (!organization_id) {
            organization_id = await ensureDefaultOrganizationId();
        }

        if (!organization_id) {
            console.error("âŒ No Organization ID found for incoming webhook.");
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

            if (type === 'text') text = msg.text?.body;
            else if (type === 'button') text = msg.button?.text; // etc.
            else if (type === 'image') text = msg.image?.caption || '[Image]';
            else if (type === 'video') text = msg.video?.caption || '[Video]';
            else if (type === 'audio') text = '[Audio]';
            else if (type === 'document') text = msg.document?.filename || '[Document]';
            else text = `[${type}]`;

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

            // PRE-DEFINE CONTENT (Media will update this row later)
            const enrichedContent: any = { text, raw: msg };

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
            } as any);

            // D. Emit Realtime
            // Emit to org room
            io.emit(`org:${organization_id}`, {
                type: 'new_message',
                message: {
                    id: storedInbound?.id || crypto.randomUUID(),
                    text,
                    from,
                    sender: 'user',
                    timestamp: storedInbound?.created_at || new Date(),
                    conversation_id: conv.id
                }
            });

            // Legacy emit for current frontend compatibility
            io.emit("new_message", {
                from,
                phone: from,
                text,
                sender: 'user',
                conversation_id: conv.id,
                contact_id: contact.id,
                message_id: storedInbound?.id || null,
                wa_message_id,
                created_at: storedInbound?.created_at || new Date().toISOString(),
                connectedAccount: metadata?.display_phone_number, // pass this if available
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
                // Only process text messages for bot replies
                let flowConsumedMessage = false;
                if (type === 'text' && text) {
                    const flowResult = await processFlowEngine(organization_id, contact.id, conv.id, text);
                    if (flowResult?.consumed) {
                        flowConsumedMessage = true;
                        
                        // Send output if flow generated one
                        if (flowResult.output) {
                            console.log(`ðŸŒŠ Flow Engine replied to: "${text.substring(0, 50)}..."`);
                            const sendResult = await sendTextMessage(from, flowResult.output, phone_number_id);
                            const botWaMessageId = sendResult?.messages?.[0]?.id || null;

                            const storedBotReply = await storeMessage({
                                organization_id, contact_id: contact.id, conversation_id: conv.id,
                                wa_message_id: botWaMessageId, direction: "outbound", type: "text",
                                content: { text: flowResult.output, is_flow: true }, status: "sent",
                            } as any);

                            io.emit("new_message", {
                                from: metadata?.display_phone_number || phone_number_id, phone: from, text: flowResult.output,
                                sender: 'agent', conversation_id: conv.id, contact_id: contact.id, message_id: storedBotReply?.id || null,
                                wa_message_id: botWaMessageId, created_at: storedBotReply?.created_at || new Date().toISOString(),
                                connectedAccount: metadata?.display_phone_number, type: 'text', is_bot_reply: true,
                            });

                            // Update conversation preview
                            await supabase.from('w_conversations').update({ last_message_at: new Date().toISOString(), last_message_preview: flowResult.output.substring(0, 100) }).eq('id', conv.id);
                        }
                    }
                }

                if (!flowConsumedMessage && type === 'text' && text) {
                    const botResult = await getBotAgentReply({
                        organization_id,
                        conversation_id: conv.id,
                        text
                    });

                    if (botResult?.reply) {
                        console.log(`ðŸ¤– Bot "${botResult.agent?.name}" replying to: "${text.substring(0, 50)}..."`);
                        
                        // Send the reply via WhatsApp
                        const sendResult = await sendTextMessage(from, botResult.reply, phone_number_id);
                        const botWaMessageId = sendResult?.messages?.[0]?.id || null;

                        // Store the bot's reply message
                        const storedBotReply = await storeMessage({
                            organization_id,
                            contact_id: contact.id,
                            conversation_id: conv.id,
                            wa_message_id: botWaMessageId,
                            direction: "outbound",
                            type: "text",
                            content: { text: botResult.reply, bot_agent_id: botResult.agent?.id },
                            status: "sent",
                        } as any);

                        // Emit the bot reply to frontend
                        io.emit("new_message", {
                            from: metadata?.display_phone_number || phone_number_id,
                            phone: from,
                            text: botResult.reply,
                            sender: 'agent',
                            conversation_id: conv.id,
                            contact_id: contact.id,
                            message_id: storedBotReply?.id || null,
                            wa_message_id: botWaMessageId,
                            created_at: storedBotReply?.created_at || new Date().toISOString(),
                            connectedAccount: metadata?.display_phone_number,
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

async function setupBaileys(sessionId: string, socket: any) {
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

        // Create dir if needed
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
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

        // Keep a small cache for org/account ids for this socket.
        let cachedOrgId: string | null = null;
        let cachedWaAccountId: string | null = null;
        const resolveOrgAndAccount = async () => {
            if (cachedOrgId && cachedWaAccountId) return { orgId: cachedOrgId, waAccountId: cachedWaAccountId };

            const orgId = cachedOrgId || (await ensureDefaultOrganizationId());
            if (!orgId) return { orgId: null as any, waAccountId: null as any };
            cachedOrgId = orgId;

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
                    let enrichedContent: any = { text: captionText || null, rawType: msgType };
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
                        status: isOutbound ? 'sent' : 'delivered'
                    });

                    // 4) Emit only realtime (not history sync)
                    if (!isHistorySync) {
                        io.emit("new_message", {
                            from: contactWaId,
                            name: threadName || senderName,
                            text: captionText,
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
                                const flowResult = await processFlowEngine(orgId, contact.id, conv.id, captionText);
                                
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
    console.log("âœ… Frontend connected:", socket.id);

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
    socket.on("request_qr", async (sessionId: string) => {
        console.log(`ðŸ”” QR generation requested for session ${sessionId}`);

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
        await setupBaileys(sessionId, socket);
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

httpServer.listen(PORT, () => {
    console.log(`âœ… Server running on port ${PORT}`);
    // Check missing dirs
    if (!fs.existsSync("baileys_auth_info")) {
        fs.mkdirSync("baileys_auth_info");
    }
});
