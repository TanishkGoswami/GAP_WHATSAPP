import { supabase } from "../config/supabase.js";
import { encryptToken, decryptToken } from "../utils/crypto.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || "https://wb.getaipilot.in/api/integrations/google/callback";

export interface GoogleBusySlot {
  start: string;
  end: string;
}

/**
 * Generate Google OAuth consent URL for popup authentication.
 */
export function getGoogleOAuthUrl(state?: string, customRedirectUri?: string): string {
  const rootUrl = "https://accounts.google.com/o/oauth2/v2/auth";
  const redirectUri = customRedirectUri || GOOGLE_REDIRECT_URI;
  const options = {
    redirect_uri: redirectUri,
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
export async function handleGoogleOAuthCallback(code: string, organizationId: string, customRedirectUri?: string) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing in server environment.");
  }

  const redirectUri = customRedirectUri || GOOGLE_REDIRECT_URI;

  // 1. Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
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
  const { error: upsertErr } = await supabase.from("w_integrations").upsert(
    {
      organization_id: organizationId,
      provider: "google_calendar",
      access_token_encrypted: accessTokenEncrypted,
      refresh_token_encrypted: refreshTokenEncrypted,
      token_expiry: tokenExpiry,
      connected_email: connectedEmail,
      metadata: { last_updated: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,provider" }
  );

  if (upsertErr) {
    console.error("Error saving Google tokens to DB:", upsertErr);
    throw new Error(`Failed to save integration details: ${upsertErr.message}`);
  }

  return { connectedEmail };
}

/**
 * Refresh access token using stored encrypted refresh token.
 */
async function getValidAccessToken(organizationId: string): Promise<string | null> {
  const { data: record } = await supabase
    .from("w_integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "google_calendar")
    .maybeSingle();

  if (!record || !record.refresh_token_encrypted) {
    return null;
  }

  // Check if current access token is still valid
  if (record.access_token_encrypted && record.token_expiry && new Date(record.token_expiry) > new Date()) {
    try {
      return decryptToken(record.access_token_encrypted);
    } catch (e) {
      console.warn("Failed to decrypt access token, refreshing...", e);
    }
  }

  // Otherwise, refresh access token using refresh_token
  const refreshToken = decryptToken(record.refresh_token_encrypted);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    console.error("Failed to refresh Google access token:", await res.text());
    return null;
  }

  const data = await res.json();
  const newAccessToken = data.access_token;
  const expiresIn = data.expires_in || 3600;

  // Update encrypted access token in DB
  const newEncryptedAccess = encryptToken(newAccessToken);
  const newExpiry = new Date(Date.now() + (expiresIn - 120) * 1000).toISOString();

  await supabase
    .from("w_integrations")
    .update({
      access_token_encrypted: newEncryptedAccess,
      token_expiry: newExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("id", record.id);

  return newAccessToken;
}

/**
 * Fetch occupied time slots from Google FreeBusy API.
 */
export async function getGoogleFreeBusy(
  organizationId: string,
  timeMinIso: string,
  timeMaxIso: string
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
        timeMin: timeMinIso,
        timeMax: timeMaxIso,
        items: [{ id: "primary" }],
      }),
    });

    if (!res.ok) {
      console.error("Google FreeBusy API Error:", await res.text());
      return [];
    }

    const data = await res.json();
    const busyList = data.calendars?.primary?.busy || [];

    return busyList.map((item: any) => ({
      start: item.start,
      end: item.end,
    }));
  } catch (error) {
    console.error("Error in getGoogleFreeBusy:", error);
    return [];
  }
}

export async function fetchGoogleBusySlots(
  organizationId: string,
  timeMinIso: string,
  timeMaxIso: string
): Promise<GoogleBusySlot[]> {
  return getGoogleFreeBusy(organizationId, timeMinIso, timeMaxIso);
}

/**
 * Create a new event on Google Calendar upon WhatsApp appointment confirmation.
 */
export async function createGoogleCalendarEvent(
  organizationId: string,
  summaryOrOptions: string | { summary: string; description?: string; startDateTimeISO: string; endDateTimeISO: string },
  startIso?: string,
  endIso?: string,
  description?: string
): Promise<boolean> {
  try {
    const accessToken = await getValidAccessToken(organizationId);
    if (!accessToken) return false;

    let summary = "";
    let finalStart = "";
    let finalEnd = "";
    let finalDesc = "";

    if (typeof summaryOrOptions === "object") {
      summary = summaryOrOptions.summary;
      finalStart = summaryOrOptions.startDateTimeISO;
      finalEnd = summaryOrOptions.endDateTimeISO;
      finalDesc = summaryOrOptions.description || "Booked via WhatsApp Automation Flow";
    } else {
      summary = summaryOrOptions;
      finalStart = startIso || "";
      finalEnd = endIso || "";
      finalDesc = description || "Booked via WhatsApp Automation Flow";
    }

    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary,
          description: finalDesc,
          start: { dateTime: finalStart },
          end: { dateTime: finalEnd },
        }),
      }
    );

    if (!res.ok) {
      console.error("Failed to create Google Calendar Event:", await res.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error in createGoogleCalendarEvent:", error);
    return false;
  }
}
