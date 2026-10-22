import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";

const scrypt = promisify(scryptCallback);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = join(ROOT, "server", "data");
const DATABASE_PATH = join(DATA_DIR, "movie-vault.sqlite");
const COOKIE_NAME = "mv_session";
const SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const MAX_REQUEST_BYTES = 1_500_000;
const LOGIN_LIMIT = { attempts: 5, windowMs: 15 * 60 * 1000 };
const REGISTER_LIMIT = { attempts: 5, windowMs: 60 * 60 * 1000 };
const requestLimits = new Map();

mkdirSync(DATA_DIR, { recursive: true });

const database = new DatabaseSync(DATABASE_PATH);
database.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS collections (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    movies TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
`);

const server = createServer(async (request, response) => {
  setSecurityHeaders(response);
  try {
    await routeRequest(request, response);
  } catch (error) {
    if (!error.status) console.error("Kesalahan API lokal:", error);
    sendJson(response, error.status || 500, {
      error: error.status ? error.message : "Terjadi kesalahan pada server lokal.",
    });
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error("Port 3001 sedang digunakan. Tutup server lokal lain lalu coba lagi.");
  } else {
    console.error("Server lokal gagal dijalankan:", error.message);
  }
  process.exitCode = 1;
});

server.listen(3001, "127.0.0.1", () => {
  console.log("Backend lokal aktif di http://127.0.0.1:3001");
});

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cache-Control", "no-store");
}

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function getCookies(request) {
  const cookies = {};
  for (const part of (request.headers.cookie || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    cookies[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
  }
  return cookies;
}

function setSessionCookie(response, token) {
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_LIFETIME_SECONDS}`
  );
}

function clearSessionCookie(response) {
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`
  );
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function safeUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function enforceLocalOrigin(request) {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.origin;
  let isViteLocalOrigin = false;
  try {
    const parsedOrigin = new URL(origin);
    const port = Number(parsedOrigin.port);
    isViteLocalOrigin =
      parsedOrigin.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(parsedOrigin.hostname) &&
      port >= 5173 &&
      port <= 5199;
  } catch {
    isViteLocalOrigin = false;
  }
  if (!isViteLocalOrigin) {
    const error = new Error("Permintaan tidak berasal dari aplikasi lokal.");
    error.status = 403;
    throw error;
  }
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      const error = new Error("Ukuran data terlalu besar.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Format data permintaan tidak valid.");
    error.status = 400;
    throw error;
  }
}

function checkRateLimit(key, limit) {
  const now = Date.now();
  const recent = (requestLimits.get(key) || []).filter(
    (timestamp) => now - timestamp < limit.windowMs
  );
  if (recent.length >= limit.attempts) {
    const error = new Error("Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.");
    error.status = 429;
    throw error;
  }
  recent.push(now);
  requestLimits.set(key, recent);
}

function clearRateLimit(key) {
  requestLimits.delete(key);
}

function clientAddress(request) {
  return request.socket.remoteAddress || "local";
}

function getAuthenticatedUser(request) {
  const token = getCookies(request)[COOKIE_NAME];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = hashToken(token);
  const now = Date.now();
  database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  return (
    database
      .prepare(
        `SELECT users.id, users.name, users.email
         FROM sessions JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash = ? AND sessions.expires_at > ?`
      )
      .get(tokenHash, now) || null
  );
}

function requireAuthenticatedUser(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    const error = new Error("Sesi berakhir. Silakan masuk kembali.");
    error.status = 401;
    throw error;
  }
  return user;
}

async function createSession(response, user) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_LIFETIME_SECONDS * 1000;
  database
    .prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .run(hashToken(token), user.id, expiresAt);
  setSessionCookie(response, token);
}

async function routeRequest(request, response) {
  const url = new URL(request.url, "http://localhost");
  const path = url.pathname;
  enforceLocalOrigin(request);

  if (path === "/api/auth/register" && request.method === "POST") {
    const body = await readJson(request);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const limitKey = `register:${clientAddress(request)}`;
    checkRateLimit(limitKey, REGISTER_LIMIT);
    if (name.length < 1 || name.length > 80) {
      return sendJson(response, 400, { error: "Nama harus berisi 1 sampai 80 karakter." });
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendJson(response, 400, { error: "Format email tidak valid." });
    }
    if (password.length < 10 || password.length > 128) {
      return sendJson(response, 400, { error: "Password harus berisi 10 sampai 128 karakter." });
    }
    if (database.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
      return sendJson(response, 409, { error: "Email sudah terdaftar." });
    }
    const salt = randomBytes(16).toString("hex");
    const passwordHash = (await scrypt(password, salt, 64)).toString("hex");
    const user = {
      id: randomUUID(),
      name,
      email,
      password_salt: salt,
      password_hash: passwordHash,
    };
    database
      .prepare(
        `INSERT INTO users (id, name, email, password_salt, password_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(user.id, user.name, user.email, salt, passwordHash, Date.now());
    await createSession(response, user);
    return sendJson(response, 201, { user: safeUser(user) });
  }

  if (path === "/api/auth/login" && request.method === "POST") {
    const body = await readJson(request);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const limitKey = `login:${clientAddress(request)}`;
    checkRateLimit(limitKey, LOGIN_LIMIT);
    const user = database
      .prepare("SELECT id, name, email, password_salt, password_hash FROM users WHERE email = ?")
      .get(email);
    const salt = user?.password_salt || "0".repeat(32);
    const expectedHash = user?.password_hash || "0".repeat(128);
    const actualHash = (await scrypt(password.slice(0, 128), salt, 64)).toString("hex");
    const matches = timingSafeEqual(
      Buffer.from(actualHash, "hex"),
      Buffer.from(expectedHash, "hex")
    );
    if (!user || !matches) {
      return sendJson(response, 401, { error: "Email atau password salah." });
    }
    clearRateLimit(limitKey);
    await createSession(response, user);
    return sendJson(response, 200, { user: safeUser(user) });
  }

  if (path === "/api/auth/session" && request.method === "GET") {
    const user = getAuthenticatedUser(request);
    if (!user) return sendJson(response, 401, { error: "Belum masuk." });
    return sendJson(response, 200, { user: safeUser(user) });
  }

  if (path === "/api/auth/logout" && request.method === "POST") {
    const token = getCookies(request)[COOKIE_NAME];
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
    }
    clearSessionCookie(response);
    return sendJson(response, 200, { ok: true });
  }

  if (path === "/api/collection" && request.method === "GET") {
    const user = requireAuthenticatedUser(request);
    const collection = database
      .prepare("SELECT movies FROM collections WHERE user_id = ?")
      .get(user.id);
    return sendJson(response, 200, {
      movies: collection ? JSON.parse(collection.movies) : [],
      hasCollection: Boolean(collection),
    });
  }

  if (path === "/api/collection" && request.method === "PUT") {
    const user = requireAuthenticatedUser(request);
    const body = await readJson(request);
    if (
      !Array.isArray(body.movies) ||
      body.movies.length > 1000 ||
      body.movies.some((movie) => !movie || typeof movie !== "object" || Array.isArray(movie))
    ) {
      return sendJson(response, 400, { error: "Format koleksi tidak valid (maksimal 1.000 film)." });
    }
    const movies = JSON.stringify(body.movies);
    database
      .prepare(
        `INSERT INTO collections (user_id, movies, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET movies = excluded.movies, updated_at = excluded.updated_at`
      )
      .run(user.id, movies, Date.now());
    return sendJson(response, 200, { movies: body.movies });
  }

  return sendJson(response, 404, { error: "Endpoint tidak ditemukan." });
}

setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, timestamps] of requestLimits) {
    const recent = timestamps.filter((timestamp) => timestamp > cutoff);
    if (recent.length) requestLimits.set(key, recent);
    else requestLimits.delete(key);
  }
}, 60 * 60 * 1000).unref();
