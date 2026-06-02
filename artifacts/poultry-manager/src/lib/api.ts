const APP_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function apiPath(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${APP_BASE}/api${normalizedPath}`;
}

/**
 * Safe JSON fetch — guards against HTML error responses that would cause
 * "SyntaxError: Unexpected token '<'" if parsed as JSON.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = apiPath(path);
  const res = await fetch(url, { credentials: "include", ...options });

  // Check content-type before calling .json() — avoids parse errors on HTML pages
  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}`;
    if (isJson) {
      try {
        const body = await res.json();
        errorMsg = body?.error ?? body?.message ?? errorMsg;
      } catch { /* ignore */ }
    }
    throw new Error(errorMsg);
  }

  if (res.status === 204 || !isJson) return null as T;
  return res.json() as Promise<T>;
}
