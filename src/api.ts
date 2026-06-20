import { storage } from "@/src/utils/storage";
import { fetchWithRetry } from "@/src/utils/fetchWithRetry";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const API = `${BASE}/api`;

const TOKEN_KEY = "djl_admin_token";

export type MediaType = "image" | "video";
export type TemplateType = "free" | "premium";

export type TemplateMeta = {
  id: string;
  title: string;
  category: string;
  template_type: TemplateType;
  price: number;
  description?: string;
  download_link: string;
  media_type: MediaType;
  thumbnail_base64: string;
  video_base64: string;
  /** Direct video URL (preferred over base64 when present). */
  video_url: string;
  downloads: number;
  created_at: string;
};

export type Notification = {
  id: string;
  title: string;
  body: string;
  template_id: string;
  created_at: string;
};

export type TemplatePayload = {
  title: string;
  category: string;
  template_type: TemplateType;
  price: number;
  description?: string;
  download_link: string;
  media_type: MediaType;
  thumbnail_base64?: string;
  video_base64?: string;
  video_url?: string;
};

async function getToken(): Promise<string | null> {
  return await storage.secureGet<string>(TOKEN_KEY, "");
}

export async function setToken(token: string | null) {
  if (token) await storage.secureSet(TOKEN_KEY, token);
  else await storage.secureRemove(TOKEN_KEY);
}

async function authHeaders(): Promise<Record<string, string>> {
  const t = await getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ---------- Public ----------
export async function listTemplates(type?: TemplateType): Promise<TemplateMeta[]> {
  const url = type ? `${API}/templates?type=${type}` : `${API}/templates`;
  const r = await fetchWithRetry(url);
  if (!r.ok) throw new Error("Failed to load templates");
  return r.json();
}

export async function getTemplate(id: string): Promise<TemplateMeta> {
  const r = await fetchWithRetry(`${API}/templates/${id}`);
  if (!r.ok) throw new Error("Template not found");
  return r.json();
}

export async function trackDownload(id: string): Promise<void> {
  try {
    await fetch(`${API}/templates/${id}/track-download`, { method: "POST" });
  } catch {
    // best-effort; never block the user
  }
}

export async function listNotifications(): Promise<Notification[]> {
  // Notifications are non-critical — short retry + low budget so we never
  // block the home screen if the backend is temporarily restarting.
  const r = await fetchWithRetry(
    `${API}/notifications`,
    {},
    { retries: 2, baseDelayMs: 300, maxDelayMs: 1500, timeoutMs: 6000 },
  );
  if (!r.ok) return [];
  return r.json();
}

// ---------- Admin ----------
export async function adminLogin(email: string, password: string): Promise<string> {
  const body = new URLSearchParams({ username: email, password });
  const r = await fetch(`${API}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!r.ok) throw new Error("Invalid email or password");
  const data = (await r.json()) as { access_token: string };
  await setToken(data.access_token);
  return data.access_token;
}

export async function adminMe(): Promise<{ email: string } | null> {
  const t = await getToken();
  if (!t) return null;
  const r = await fetch(`${API}/admin/me`, { headers: await authHeaders() });
  if (!r.ok) return null;
  return r.json();
}

export async function adminLogout() {
  await setToken(null);
}

export async function adminListTemplates(): Promise<TemplateMeta[]> {
  const r = await fetch(`${API}/admin/templates`, { headers: await authHeaders() });
  if (!r.ok) throw new Error("Failed to load");
  return r.json();
}

export async function adminCreateTemplate(payload: TemplatePayload): Promise<TemplateMeta> {
  const r = await fetch(`${API}/admin/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || "Create failed");
  }
  return r.json();
}

export async function adminUpdateTemplate(
  id: string,
  payload: Partial<TemplatePayload>,
): Promise<TemplateMeta> {
  const r = await fetch(`${API}/admin/templates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || "Update failed");
  }
  return r.json();
}

export async function adminDeleteTemplate(id: string): Promise<void> {
  const r = await fetch(`${API}/admin/templates/${id}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!r.ok) throw new Error("Delete failed");
}
