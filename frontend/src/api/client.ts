export const apiBase = (import.meta.env.VITE_API_URL || 'http://192.168.58.158:8000').replace(/\/$/, '');

type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

type ApiError = Error & {
  status?: number;
  data?: unknown;
};

async function request<T>(method: ApiMethod, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const init: RequestInit = {
    method,
    credentials: 'include',
    headers
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const res = await fetch(`${apiBase}${path}`, init);
  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const err = new Error(`API request failed with status ${res.status}`) as ApiError;
    err.status = res.status;
    err.data = payload;
    throw err;
  }

  return payload as T;
}

export const apiGet = <T>(path: string) => request<T>('GET', path);
export const apiPost = <T>(path: string, body?: unknown) => request<T>('POST', path, body);
export const apiPatch = <T>(path: string, body?: unknown) => request<T>('PATCH', path, body);
export const apiDelete = <T>(path: string) => request<T>('DELETE', path);
