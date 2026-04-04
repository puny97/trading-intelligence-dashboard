/**
 * Shared in-memory token store for Fyers access token.
 * Token is valid until midnight IST each trading day.
 * Stored at module level so it persists across requests in the same Node.js process.
 */

export interface TokenStore {
  accessToken: string;
  clientId: string;
  expiresAt: number; // Unix ms — midnight IST
}

// Global singleton — survives across hot reloads in dev too
const g = global as any;
if (!g.__fyersToken) g.__fyersToken = null;

export function getToken(): TokenStore | null {
  return g.__fyersToken;
}

export function setToken(t: TokenStore) {
  g.__fyersToken = t;
  console.log(
    "[Fyers] Access token stored, expires:",
    new Date(t.expiresAt).toISOString(),
  );
}

export function clearToken() {
  g.__fyersToken = null;
}

export function isTokenValid(): boolean {
  const t = g.__fyersToken;
  if (!t) return false;
  return Date.now() < t.expiresAt;
}

// Midnight IST = midnight UTC+5:30 = 18:30 UTC
export function midnightIST(): number {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(now.getTime() + istOffset);
  const midnight = new Date(
    Date.UTC(
      nowIST.getUTCFullYear(),
      nowIST.getUTCMonth(),
      nowIST.getUTCDate() + 1, // next midnight
      0,
      0,
      0,
      0,
    ) - istOffset,
  );
  return midnight.getTime();
}
