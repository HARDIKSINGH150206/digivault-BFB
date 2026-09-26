import { getSession, hasStoredSession } from "./auth-storage";

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(typeof body === "object" && body && "message" in body ? String((body as { message: unknown }).message) : `Request failed (${status})`);
  }
}

/** Fetch wrapper that attaches the session's Authorization: Bearer header. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const hadSession = hasStoredSession();
  const session = getSession();
  // getSession() drops an expired session; send the officer back to sign in instead of failing every call.
  if (hadSession && !session && !path.startsWith("/api/auth/login")) {
    window.location.assign("/login");
    throw new ApiError(401, { message: "Your session has expired. Sign in again." });
  }
  const headers = new Headers(init.headers);
  if (session) headers.set("Authorization", `Bearer ${session.token}`);
  return fetch(path, { ...init, headers });
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await apiFetch(path, { ...init, headers });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}
