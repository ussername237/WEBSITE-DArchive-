function safeUrlForLog(input) {
  try {
    const url = new URL(input, globalThis.location?.origin || "http://localhost");
    for (const key of ["api_key", "apikey", "key", "token"]) {
      if (url.searchParams.has(key)) url.searchParams.set(key, "[redacted]");
    }
    return url.toString();
  } catch {
    return String(input).replace(
      /([?&](?:api_key|apikey|key|token)=)[^&]*/gi,
      "$1[redacted]"
    );
  }
}

export default async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const isJson =
    contentType.includes("application/json") ||
    /\bapplication\/[\w.-]+\+json\b/i.test(contentType);

  if (!isJson) {
    const body = await response.text();
    const preview = body.slice(0, 500);
    console.error("Bukan JSON dari:", safeUrlForLog(url), preview);
    throw new Error(
      response.ok
        ? `Server tidak mengembalikan JSON (HTTP ${response.status}). Periksa URL atau konfigurasi hosting.`
        : `Permintaan gagal (HTTP ${response.status}); server tidak mengembalikan JSON.`
    );
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    console.error("JSON tidak valid dari:", safeUrlForLog(url), error);
    throw new Error("Server mengembalikan JSON yang tidak valid.");
  }

  if (!response.ok) {
    const detail =
      data?.status_message ||
      data?.Error ||
      data?.message ||
      `Permintaan gagal (HTTP ${response.status}).`;
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }

  return data;
}
