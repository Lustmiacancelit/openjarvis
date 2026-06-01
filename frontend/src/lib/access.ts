export const ACCESS_ADMIN_EMAIL = 'support@flowlog.dev';
export const ACCESS_SESSION_KEY = 'Jarvis-access-session';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://mtbtgpwzrbostweaanpr.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10YnRncHd6cmJvc3R3ZWFhbnByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODk0OTQsImV4cCI6MjA4ODc2NTQ5NH0._xMlqCfljtXpwPj54H-ghxfLFO-jiq4W2WhpU8vVL1c';

export type AccessStatus = 'pending' | 'approved' | 'denied';

export interface AccessSession {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: {
    id: string;
    email?: string;
  };
}

export interface AccessRequest {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string | null;
  reason: string | null;
  status: AccessStatus;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

const authHeaders = (token?: string) => ({
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
});

const normalizeEmail = (email: string) => email.trim().toLowerCase();

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.msg || data?.message || data?.error_description || data?.hint || response.statusText);
  }
  return data as T;
}

export const isHostedAccessControlEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'jarvis.flowlog.dev' || host === 'www.jarvis.flowlog.dev';
};

export const isAdminEmail = (email?: string) => normalizeEmail(email || '') === ACCESS_ADMIN_EMAIL;

export const loadAccessSession = (): AccessSession | null => {
  try {
    const raw = localStorage.getItem(ACCESS_SESSION_KEY);
    return raw ? (JSON.parse(raw) as AccessSession) : null;
  } catch {
    return null;
  }
};

export const saveAccessSession = (session: AccessSession) => {
  localStorage.setItem(ACCESS_SESSION_KEY, JSON.stringify(session));
};

export const clearAccessSession = () => {
  localStorage.removeItem(ACCESS_SESSION_KEY);
};

export async function signIn(email: string, password: string): Promise<AccessSession> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email: normalizeEmail(email), password }),
  });
  const session = await readJson<AccessSession>(response);
  saveAccessSession(session);
  return session;
}

export async function signUp(
  email: string,
  password: string,
  fullName: string,
): Promise<AccessSession | null> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      email: normalizeEmail(email),
      password,
      data: { full_name: fullName.trim() },
    }),
  });
  const data = await readJson<AccessSession | { access_token?: string; user?: AccessSession['user'] }>(response);
  if ('access_token' in data && data.access_token && data.user) {
    const session = data as AccessSession;
    saveAccessSession(session);
    return session;
  }
  return null;
}

export async function getCurrentUser(session: AccessSession): Promise<AccessSession['user']> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: authHeaders(session.access_token),
  });
  return readJson<AccessSession['user']>(response);
}

export async function logout(session: AccessSession | null) {
  if (session?.access_token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: authHeaders(session.access_token),
    }).catch(() => {});
  }
  clearAccessSession();
}

export async function requestAccess(
  session: AccessSession,
  fullName: string,
  reason: string,
): Promise<AccessRequest> {
  const email = normalizeEmail(session.user.email || '');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/jarvis_access_requests`, {
    method: 'POST',
    headers: {
      ...authHeaders(session.access_token),
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      user_id: session.user.id,
      email,
      full_name: fullName.trim() || null,
      reason: reason.trim() || null,
      status: 'pending',
    }),
  });
  if (response.status === 409) {
    const existing = await getAccessRequest(session);
    if (existing) return existing;
  }
  const rows = await readJson<AccessRequest[]>(response);
  return rows[0];
}

export async function getAccessRequest(session: AccessSession): Promise<AccessRequest | null> {
  const email = normalizeEmail(session.user.email || '');
  if (!email) return null;
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/jarvis_access_requests?email=eq.${encodeURIComponent(email)}&select=*&limit=1`,
    { headers: authHeaders(session.access_token) },
  );
  const rows = await readJson<AccessRequest[]>(response);
  return rows[0] || null;
}

export async function listAccessRequests(session: AccessSession): Promise<AccessRequest[]> {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/jarvis_access_requests?select=*&order=requested_at.desc`,
    { headers: authHeaders(session.access_token) },
  );
  return readJson<AccessRequest[]>(response);
}

export async function reviewAccessRequest(
  session: AccessSession,
  id: string,
  status: 'approved' | 'denied',
): Promise<AccessRequest> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/jarvis_access_requests?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      ...authHeaders(session.access_token),
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: session.user.email || ACCESS_ADMIN_EMAIL,
    }),
  });
  const rows = await readJson<AccessRequest[]>(response);
  return rows[0];
}
