import { supabase } from "../config/supabase.js";
import { encryptToken, decryptToken } from "../utils/crypto.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/api/integrations/google/callback";

export interface GoogleBusySlot {
  start: string;
  end: string;
}

/**
 * Generate Google OAuth consent URL for popup authentication.
 */
export function getGoogleOAuthUrl(state?: string): string {
  const rootUrl = "https://accounts.google.com/o/oauth2/v2/auth";
  const options = {
    redirect_uri: GOOGLE_REDIRECT_URI,
    client_id: GOOGLE_CLIENT_ID,
    access_type: "offline",
    response_type: "code",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
    ].join(" "),
    state: state || "",
  };

  const qs = new URLSearchParams(options).toString();
  return `${rootUrl}?${qs}`;
}

/**
 * Exchange Authorization Code for Access & Refresh tokens, encrypt them, and store in DB.
 */
export async function handleGoogleOAuthCallback(code: string, organizationId: string) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing in server environment.");
  }

  // 1. Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Failed to exchange Google OAuth code: ${errText}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;
  const expiresIn = tokenData.expires_in || 3600;

  // 2. Fetch User Email for display
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const userData = userRes.ok ? await userRes.json() : {};
  const connectedEmail = userData.email || "Google Account";

  // 3. Encrypt both tokens before storing
  const accessTokenEncrypted = encryptToken(accessToken);
  const refreshTokenEncrypted = refreshToken ? encryptToken(refreshToken) : null;
  const tokenExpiry = new Date(Date.now() + (expiresIn - 120) * 1000).toISOString();

  // 4. Upsert connection record in Supabase
  const { data: existing } = await supabase
    .from("w_integrations")
    .select("refresh_token_encrypted")
    .eq("organization_id", organizationId)
    .eq("provider", "google_calendar")
    .maybeSingle();

  const finalRefreshTokenEnc = refreshTokenEncrypted || existing?.refresh_token_encrypted || null;

  const { error: upsertErr } = await supabase
    .from("w_integrations")
    .upsert(
      {
        organization_id: organizationId,
        provider: "google_calendar",
        access_token_encrypted: accessTokenEncrypted,
        refresh_token_encrypted: finalRefreshTokenEnc,
        token_expiry: tokenExpiry,
        connected_email: connectedEmail,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,provider" }
    );

  if (upsertErr) {
    throw new Error(`Failed to save Google integration: ${upsertErr.message}`);
  }

  return { connectedEmail };
}

/**
 * Get valid plain-text access token (decrypting or automatically refreshing if expired).
 */
export async function getValidAccessToken(organizationId: string): Promise<string | null> {
  const { data: integration } = await supabase
    .from("w_integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "google_calendar")
    .maybeSingle();

  if (!integration) return null;

  const expiry = new Date(integration.token_expiry || 0).getTime();
  const now = Date.now();

  // If access token is still valid, decrypt and return
  if (expiry > now && integration.access_token_encrypted) {
    const decrypted = decryptToken(integration.access_token_encrypted);
    if (decrypted) return decrypted;
  }

  // Otherwise, refresh token using refresh_token_encrypted
  if (!integration.refresh_token_encrypted) {
    console.warn(`No refresh token available for organization ${organizationId}`);
    return null;
  }

  const decryptedRefreshToken = decryptToken(integration.refresh_token_encrypted);
  if (!decryptedRefreshToken) return null;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: decryptedRefreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenRes.ok) {
    console.error(`Failed to refresh Google OAuth token for org ${organizationId}`);
    return null;
  }

  const tokenData = await tokenRes.json();
  const newAccessToken = tokenData.access_token;
  const expiresIn = tokenData.expires_in || 3600;

  // Encrypt new access token and update DB
  const newAccessTokenEncrypted = encryptToken(newAccessToken);
  const newExpiry = new Date(Date.now() + (expiresIn - 120) * 1000).toISOString();

  await supabase
    .from("w_integrations")
    .update({
      access_token_encrypted: newAccessTokenEncrypted,
      token_expiry: newExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("id", integration.id);

  return newAccessToken;
}

/**
 * Fetch occupied/busy time slots from Google Calendar for a date window.
 */
export async function fetchGoogleBusySlots(
  organizationId: string,
  timeMin: string,
  timeMax: string
): Promise<GoogleBusySlot[]> {
  try {
    const accessToken = await getValidAccessToken(organizationId);
    if (!accessToken) return [];

    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        items: [{ id: "primary" }],
      }),
    });

    if (!res.ok) {
      console.error("Error fetching Google FreeBusy:", await res.text());
      return [];
    }

    const data = await res.json();
    const busyArray = data?.calendars?.primary?.busy || [];
    return busyArray as GoogleBusySlot[];
  } catch (error) {
    console.error("Failed to query Google Calendar busy slots:", error);
    return [];
  }
}

/**
 * Create a new Event on the Google Primary Calendar upon confirmation.
 */
export async function createGoogleCalendarEvent(
  organizationId: string,
  event: {
    summary: string;
    description?: string;
    startDateTimeISO: string;
    endDateTimeISO: string;
  }
) {
  try {
    const accessToken = await getValidAccessToken(organizationId);
    if (!accessToken) {
      console.warn(`Cannot create Google Calendar event: No active token for org ${organizationId}`);
      return null;
    }

    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description || "Booked via WhatsApp Flow",
        start: { dateTime: event.startDateTimeISO },
        end: { dateTime: event.endDateTimeISO },
      }),
    });

    if (!res.ok) {
      console.error("Failed to insert Google Calendar event:", await res.text());
      return null;
    }

    return await res.json();
  } catch (error) {
    console.error("Failed to create Google Calendar event:", error);
    return null;
  }
}
