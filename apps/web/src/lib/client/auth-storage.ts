export interface Session {
  token: string;
  userId: string;
  role: string;
  /** From POST /api/auth/login; absent in sessions stored before these fields were kept. */
  serviceNumber?: string;
  department?: string | null;
}

const KEY = "digivault_session";

/** Session tokens are base64url(`userId.role.expiryMs.signature`) (src/lib/auth.ts); the server rejects them after expiry. */
function isExpired(session: Session): boolean {
  try {
    const decoded = atob(session.token.replace(/-/g, "+").replace(/_/g, "/"));
    const expiry = Number(decoded.split(".")[2]);
    return Number.isFinite(expiry) && Date.now() >= expiry;
  } catch {
    return false;
  }
}

/** The stored session, or null when there is none or its token has expired (an expired one is removed). */
export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    const session = raw ? (JSON.parse(raw) as Session) : null;
    if (session && isExpired(session)) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function hasStoredSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function setSession(session: Session): void {
  window.localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession(): void {
  window.localStorage.removeItem(KEY);
}
