const COOKIE_NAME = "train_session";
const COOKIE_PATH = "/api/train";
const SESSION_LIFETIME_SECONDS = 8 * 60 * 60;
const MAX_BODY_BYTES = 1024;
const MAX_CODE_BYTES = 512;
const MIN_CODE_BYTES = 1;
const MIN_SESSION_KEY_BYTES = 32;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const protectedHeaders = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer"
};

function responseJson(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...protectedHeaders,
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlDecode(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  try {
    const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return base64UrlEncode(bytes) === value ? bytes : null;
  } catch {
    return null;
  }
}

function bytesEqualConstantTime(left, right) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index % Math.max(1, left.length)] ?? 0) ^ (right[index % Math.max(1, right.length)] ?? 0);
  }
  return difference === 0;
}

async function digest(cryptoApi, bytes) {
  return new Uint8Array(await cryptoApi.subtle.digest("SHA-256", bytes));
}

async function textEqualConstantTime(cryptoApi, left, right) {
  const [leftDigest, rightDigest] = await Promise.all([
    digest(cryptoApi, encoder.encode(left)),
    digest(cryptoApi, encoder.encode(right))
  ]);
  return bytesEqualConstantTime(leftDigest, rightDigest);
}

function validSecrets(env) {
  const code = env.AVATAR_UNLOCK_CODE;
  const key = env.AVATAR_SESSION_KEY;
  if (typeof code !== "string" || typeof key !== "string") return null;
  if (encoder.encode(code).length < MIN_CODE_BYTES || encoder.encode(code).length > MAX_CODE_BYTES) return null;
  if (encoder.encode(key).length < MIN_SESSION_KEY_BYTES) return null;
  if (code === key) return null;
  return { code, key };
}

async function hmac(cryptoApi, keyText, value) {
  const key = await cryptoApi.subtle.importKey(
    "raw",
    encoder.encode(keyText),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await cryptoApi.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function makeSession(cryptoApi, key, nowMs) {
  const issuedAt = Math.floor(nowMs / 1000);
  const payload = base64UrlEncode(encoder.encode(JSON.stringify({
    v: 1,
    iat: issuedAt,
    exp: issuedAt + SESSION_LIFETIME_SECONDS
  })));
  const signature = base64UrlEncode(await hmac(cryptoApi, key, payload));
  return `${payload}.${signature}`;
}

function cookieValue(request) {
  const header = request.headers.get("cookie");
  if (!header) return null;
  const matches = header.split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (matches.length !== 1) return null;
  return matches[0].slice(COOKIE_NAME.length + 1);
}

async function hasValidSession(request, secretKey, cryptoApi, nowMs) {
  const token = cookieValue(request);
  if (!token || token.length > 512) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const signature = base64UrlDecode(parts[1]);
  if (!signature || signature.length !== 32) return false;
  const expected = await hmac(cryptoApi, secretKey, parts[0]);
  if (!bytesEqualConstantTime(expected, signature)) return false;
  const payload = base64UrlDecode(parts[0]);
  if (!payload) return false;
  let claims;
  try {
    claims = JSON.parse(decoder.decode(payload));
  } catch {
    return false;
  }
  const now = Math.floor(nowMs / 1000);
  return claims !== null
    && typeof claims === "object"
    && claims.v === 1
    && Number.isSafeInteger(claims.iat)
    && Number.isSafeInteger(claims.exp)
    && claims.iat <= now
    && claims.exp > now
    && claims.exp - claims.iat === SESSION_LIFETIME_SECONDS;
}

async function readBoundedBody(request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/u.test(contentLength)) return { status: 400 };
    const declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength)) return { status: 400 };
    if (declaredLength > MAX_BODY_BYTES) return { status: 413 };
  }
  if (!request.body) return { status: 400 };
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return { status: 413 };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { text: decoder.decode(bytes) };
  } catch {
    return { status: 400 };
  }
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

async function unlockRateLimit(request, env) {
  const limiter = env.TRAIN_UNLOCK_LIMITER;
  if (!limiter || typeof limiter.limit !== "function") return "unavailable";
  const key = request.headers.get("cf-connecting-ip") || "unknown";
  try {
    const result = await limiter.limit({ key });
    if (result?.success === true) return "allowed";
    if (result?.success === false) return "limited";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

function avatarBytes(avatar) {
  if (avatar instanceof ArrayBuffer) return new Uint8Array(avatar);
  if (ArrayBuffer.isView(avatar)) return new Uint8Array(avatar.buffer, avatar.byteOffset, avatar.byteLength);
  throw new TypeError("Avatar data module is unavailable");
}

function clearCookie() {
  return `${COOKIE_NAME}=; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Strict`;
}

function setCookie(token) {
  return `${COOKIE_NAME}=${token}; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Strict`;
}

function methodNotAllowed(allowed) {
  return responseJson({ error: "method_not_allowed" }, 405, { allow: allowed.join(", ") });
}

function authorizedAccess(env) {
  const label=typeof env.AVATAR_PRIVATE_LABEL==="string"&&env.AVATAR_PRIVATE_LABEL.trim()
    ?env.AVATAR_PRIVATE_LABEL.trim().slice(0,80):"Unlocked avatar";
  return {unlocked:true,avatar:{label}};
}

export function createAvatarWorker({ avatar, avatarLow = avatar, cryptoApi = globalThis.crypto, now = () => Date.now() }) {
  const routes = new Map([
    ["/api/train/unlock", ["POST"]],
    ["/api/train/access", ["GET", "DELETE"]],
    ["/api/train/avatar", ["GET"]]
  ]);

  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const allowedMethods = routes.get(url.pathname);
      if (!allowedMethods) {
        if (env.ASSETS && typeof env.ASSETS.fetch === "function") return env.ASSETS.fetch(request);
        return new Response("Not Found", { status: 404 });
      }
      if (!allowedMethods.includes(request.method)) return methodNotAllowed(allowedMethods);

      if (request.method === "POST" || request.method === "DELETE") {
        if (!sameOrigin(request)) return responseJson({ error: "same_origin_required" }, 403);
      }

      if (url.pathname === "/api/train/unlock") {
        const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
        if (contentType !== "application/json") return responseJson({ error: "invalid_request" }, 415);
        const secrets = validSecrets(env);
        if (!secrets) return responseJson({ error: "unavailable" }, 503);
        const rateLimit = await unlockRateLimit(request, env);
        if (rateLimit === "limited") return responseJson({ error: "rate_limited" }, 429);
        if (rateLimit === "unavailable") return responseJson({ error: "unavailable" }, 503);
        const body = await readBoundedBody(request);
        if (body.status) return responseJson({ error: "invalid_request" }, body.status);
        let parsed;
        try {
          parsed = JSON.parse(body.text);
        } catch {
          return responseJson({ error: "invalid_request" }, 400);
        }
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)
          || Object.keys(parsed).length !== 1 || typeof parsed.code !== "string") {
          return responseJson({ error: "invalid_request" }, 400);
        }
        const codeBytes = encoder.encode(parsed.code);
        if (codeBytes.length === 0 || codeBytes.length > MAX_CODE_BYTES) {
          return responseJson({ error: "invalid_request" }, 400);
        }
        if (!await textEqualConstantTime(cryptoApi, parsed.code, secrets.code)) {
          return responseJson({ error: "invalid_code" }, 401);
        }
        const token = await makeSession(cryptoApi, secrets.key, now());
        return responseJson(authorizedAccess(env), 200, { "set-cookie": setCookie(token) });
      }

      if (url.pathname === "/api/train/access") {
        if (request.method === "DELETE") {
          return responseJson({ unlocked: false }, 200, { "set-cookie": clearCookie() });
        }
        const secrets = validSecrets(env);
        const unlocked = secrets
          ? await hasValidSession(request, secrets.key, cryptoApi, now())
          : false;
        return responseJson(unlocked?authorizedAccess(env):{unlocked:false});
      }

      const secrets = validSecrets(env);
      if (!secrets) return responseJson({ error: "unavailable" }, 503);
      if (!await hasValidSession(request, secrets.key, cryptoApi, now())) {
        return responseJson({ error: "unauthorized" }, 401);
      }
      try {
        const quality=url.searchParams.get("quality")??"high";
        if(quality!=="low"&&quality!=="high")return responseJson({error:"invalid_quality"},400);
        const bytes = avatarBytes(quality==="low"?avatarLow:avatar);
        return new Response(bytes, {
          headers: {
            ...protectedHeaders,
            "content-type": "model/gltf-binary",
            "content-length": String(bytes.byteLength),
            "content-disposition": "inline; filename=avatar.glb"
          }
        });
      } catch {
        return responseJson({ error: "unavailable" }, 503);
      }
    }
  };
}
