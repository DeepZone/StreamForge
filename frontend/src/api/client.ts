const configuredApiUrl = import.meta.env.VITE_API_URL?.trim() ?? '';

function resolveApiBase(): string {
  if (!configuredApiUrl) return '';
  try {
    const configured = new URL(configuredApiUrl, window.location.origin);
    if (window.location.protocol === 'https:' && configured.protocol === 'http:') configured.protocol = 'https:';
    const normalized = configured.toString().replace(/\/$/, '');
    return normalized === window.location.origin ? '' : normalized;
  } catch {
    return configuredApiUrl.replace(/\/$/, '');
  }
}

export const apiBase = resolveApiBase();
const withApiBase = (path: string) => (apiBase ? `${apiBase}${path}` : path);

type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type ApiError = Error & { status?: number; data?: unknown };

async function request<T>(method: ApiMethod, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const init: RequestInit = { method, credentials: 'include', headers };
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  const res = await fetch(withApiBase(path), init);
  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await res.json() : null;
  if (!res.ok) { const err = new Error(`API request failed with status ${res.status}`) as ApiError; err.status = res.status; err.data = payload; throw err; }
  return payload as T;
}

export const apiGet = <T>(path: string) => request<T>('GET', path);
export const apiPost = <T>(path: string, body?: unknown) => request<T>('POST', path, body);
export const apiPatch = <T>(path: string, body?: unknown) => request<T>('PATCH', path, body);
export const apiDelete = <T>(path: string) => request<T>('DELETE', path);
