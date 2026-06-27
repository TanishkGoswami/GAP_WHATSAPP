import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

// ====== AES-256-CBC Token Encryption ======
// TOKEN_ENCRYPTION_KEY must be exactly 32 ASCII characters in .env
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || '';

export function encryptToken(token: string): string {
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
        console.warn('⚠️ TOKEN_ENCRYPTION_KEY not set or not 32 chars — storing token unencrypted!');
        return token;
    }
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    const encrypted = Buffer.concat([cipher.update(token), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptToken(stored: string | null | undefined): string {
    if (!stored) {
        return '';
    }
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32 || !stored.includes(':')) {
        // Not encrypted (legacy plain-text or key not set) — return as-is
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
