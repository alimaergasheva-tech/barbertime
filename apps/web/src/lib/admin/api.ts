import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Server-only: imported by Server Components and Server Actions of /admin.
const API_URL = process.env.API_URL ?? "http://localhost:4000";

/** httpOnly cookie holding the opaque session token; the API stores only its hash. */
export const ADMIN_COOKIE = "bt_admin";

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

type FetchOptions = { method?: string; body?: unknown; form?: FormData; headers?: Record<string, string> };

/** Raw call without a session (login). */
export async function callApi<T>(path: string, options: FetchOptions = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = { ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (options.form) body = options.form;
  else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/admin${path}`, { method: options.method ?? "GET", headers, body, cache: "no-store" });
  } catch {
    throw new AdminApiError(0, "API_UNREACHABLE", "API недоступен");
  }
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => null)) as (T & { code?: string; message?: string }) | null;
  if (!response.ok) {
    throw new AdminApiError(response.status, data?.code ?? "API_ERROR", data?.message ?? response.statusText);
  }
  return data as T;
}

export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(ADMIN_COOKIE)?.value;
}

/** Authenticated call; an expired or missing session sends the user to the login page. */
export async function adminFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const token = await getSessionToken();
  if (!token) redirect("/admin/login");
  try {
    return await callApi<T>(path, options, token);
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) redirect("/admin/login?expired=1");
    throw error;
  }
}
