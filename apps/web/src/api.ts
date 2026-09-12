import type { User } from './types';
const origin = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
let token: string | null = null;
let refreshing: Promise<{ user: User; accessToken: string }> | null = null;
let onSession: (user: User | null) => void = () => {};
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
export function configureSession(callback: typeof onSession) {
  onSession = callback;
}
export function currentToken() {
  return token;
}
function saveSession(result: { user: User; accessToken: string }) {
  token = result.accessToken;
  onSession(result.user);
  clearTimeout(refreshTimer);
  const claims = JSON.parse(atob(token.split('.')[1]));
  refreshTimer = setTimeout(
    () => {
      void refreshSession().catch(() => {});
    },
    Math.max(1000, claims.exp * 1000 - Date.now() - 60000),
  );
  return result;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}
async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok) {
    const error = body.error;
    throw new ApiError(
      error?.details?.[0]?.message || error?.message || 'The request could not be completed.',
      response.status,
      error?.code || 'ERROR',
    );
  }
  return body;
}
export function refreshSession() {
  if (!refreshing) {
    const run = async () =>
      parseResponse<{ user: User; accessToken: string }>(
        await fetch(`${origin}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Fieldwork' },
          body: '{}',
        }),
      );
    // Tabs share one HttpOnly refresh cookie. Serialize rotation to avoid treating a second tab as token replay.
    refreshing = (async () => {
      if (navigator.locks) return await navigator.locks.request('fieldwork-refresh', run);
      return await run();
    })()
      .then(saveSession)
      .catch((error) => {
        token = null;
        clearTimeout(refreshTimer);
        onSession(null);
        throw error;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const response = await fetch(`${origin}/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'Fieldwork',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    await refreshSession();
    return request<T>(path, options, false);
  }
  return parseResponse<T>(response);
}
export async function signIn(email: string, password: string) {
  return saveSession(
    await request<{ user: User; accessToken: string }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
      false,
    ),
  );
}
export async function signOut() {
  try {
    await request('/auth/logout', { method: 'POST', body: '{}' }, false);
  } finally {
    token = null;
    clearTimeout(refreshTimer);
    onSession(null);
  }
}
export const mutate = <T>(path: string, method: string, data: unknown) =>
  request<T>(path, { method, body: JSON.stringify(data) });
