const SESSION_CACHE = "mv_local_user";
const OLD_SESSION_CACHE = "mv_supabase_user";

export function getSession() {
  try {
    localStorage.removeItem(OLD_SESSION_CACHE);
    const value = localStorage.getItem(SESSION_CACHE);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export async function getAuthenticatedUser() {
  const response = await fetch("/api/auth/session", {
    credentials: "same-origin",
  });
  if (response.status === 401) {
    localStorage.removeItem(SESSION_CACHE);
    return null;
  }
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Sesi tidak dapat diverifikasi.");
  }
  localStorage.setItem(SESSION_CACHE, JSON.stringify(result.user));
  return result.user;
}

export async function register(name, email, password) {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ name, email, password }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Pendaftaran akun gagal.");
  localStorage.setItem(SESSION_CACHE, JSON.stringify(result.user));
  return result.user;
}

export async function login(email, password) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ email, password }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Login gagal.");
  localStorage.setItem(SESSION_CACHE, JSON.stringify(result.user));
  return result.user;
}

export async function logout() {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Tidak dapat keluar.");
  localStorage.removeItem(SESSION_CACHE);
}
