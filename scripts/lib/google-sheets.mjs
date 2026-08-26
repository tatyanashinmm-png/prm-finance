// Доступ к Google Sheets из обычного Node-скрипта (не из Worker'а).
// Та же схема авторизации сервисным аккаунтом, что и в webhook/src/sheets.js
// в репозитории invoice-reconcile — JWT подписываем сами, меняем на access
// token. Использует Web Crypto (globalThis.crypto), которая в Node 19+
// доступна глобально без дополнительных пакетов.

function b64url(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function str2ab(str) {
  return new TextEncoder().encode(str);
}

async function getAccessToken(saJson) {
  const sa = typeof saJson === "string" ? JSON.parse(saJson) : saJson;
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const enc = (o) => b64url(str2ab(JSON.stringify(o)));
  const unsigned = `${enc(header)}.${enc(claim)}`;

  const pem = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, str2ab(unsigned));
  const jwt = `${unsigned}.${b64url(sig)}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!resp.ok) throw new Error(`Google auth: ${resp.status} ${await resp.text()}`);
  return (await resp.json()).access_token;
}

// Возвращает values как из Sheets API: массив строк, каждая — массив ячеек,
// UNFORMATTED_VALUE (даты — как Excel-серийные числа, не форматированный текст).
export async function fetchSheetValues(saJson, sheetId, tab, range = "A1:ZZ") {
  const token = await getAccessToken(saJson);
  const fullRange = `${tab}!${range}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
    fullRange,
  )}?valueRenderOption=UNFORMATTED_VALUE`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`Sheets GET ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data.values || [];
}
