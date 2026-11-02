import assert from "node:assert/strict";
import { test } from "node:test";
import { webcrypto } from "node:crypto";
import { createAvatarWorker } from "../worker/avatar-auth.mjs";

const origin = "https://example.test";
const nowMs = 1_800_000_000_000;
const unlockCode = `test-only-${"x".repeat(32)}`;
const sessionKey = `test-only-session-${"y".repeat(40)}`;
const avatarBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]);

function limiter({ success = true } = {}) {
  const keys = [];
  return {
    keys,
    async limit(input) {
      keys.push(input.key);
      return { success };
    }
  };
}

function environment(overrides = {}) {
  return {
    AVATAR_UNLOCK_CODE: unlockCode,
    AVATAR_SESSION_KEY: sessionKey,
    AVATAR_PRIVATE_LABEL: "Test avatar",
    TRAIN_UNLOCK_LIMITER: limiter(),
    ASSETS: { fetch: async () => new Response("static asset", { status: 200 }) },
    ...overrides
  };
}

function request(path, { method = "GET", headers = {}, body } = {}) {
  return new Request(`${origin}${path}`, { method, headers, body });
}

function worker(overrides = {}) {
  return createAvatarWorker({ avatar: avatarBytes, cryptoApi: webcrypto, now: () => nowMs, ...overrides });
}

async function unlock(instance, env = environment(), code = unlockCode) {
  return instance.fetch(request("/api/train/unlock", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "cf-connecting-ip": "192.0.2.10"
    },
    body: JSON.stringify({ code })
  }), env);
}

function sessionCookie(response) {
  return response.headers.get("set-cookie").split(";", 1)[0];
}

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

async function signedCookie(claims) {
  const payload = base64Url(Buffer.from(JSON.stringify(claims)));
  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(await webcrypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return `train_session=${payload}.${base64Url(signature)}`;
}

test("unauthenticated access never returns the private avatar", async () => {
  const instance = worker();
  const env = environment();
  const access = await instance.fetch(request("/api/train/access"), env);
  const avatar = await instance.fetch(request("/api/train/avatar"), env);
  assert.deepEqual(await access.json(), { unlocked: false });
  assert.equal(avatar.status, 401);
  assert.deepEqual(await avatar.json(), { error: "unauthorized" });
  assert.equal(avatar.headers.get("cache-control"), "private, no-store, max-age=0");
});

test("a short user-selected code works with an independent strong signing key", async () => {
  const env=environment({AVATAR_UNLOCK_CODE:"demo"});
  const response=await unlock(worker(),env,"demo");
  assert.equal(response.status,200);
  assert.ok(response.headers.get("set-cookie"));
});

test("private labels come from environment configuration and stay hidden before authorization",async()=>{
  const instance=worker();
  const env=environment({AVATAR_PRIVATE_LABEL:"Configured display name"});
  const anonymous=await instance.fetch(request("/api/train/access"),env);
  assert.deepEqual(await anonymous.json(),{unlocked:false});
  const response=await unlock(instance,env);
  assert.deepEqual(await response.json(),{unlocked:true,avatar:{label:"Configured display name"}});
  const cookie=sessionCookie(response);
  const changed=environment({AVATAR_PRIVATE_LABEL:"Updated display name"});
  const access=await instance.fetch(request("/api/train/access",{headers:{cookie}}),changed);
  assert.deepEqual(await access.json(),{unlocked:true,avatar:{label:"Updated display name"}});
});

test("unlock issues a bounded session cookie, authorizes the avatar, and delete revokes it", async () => {
  const instance = worker();
  const env = environment();
  const response = await unlock(instance, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { unlocked: true,avatar:{label:"Test avatar"} });
  const cookie = sessionCookie(response);
  assert.match(response.headers.get("set-cookie"), /; Path=\/api\/train; HttpOnly; Secure; SameSite=Strict$/u);
  assert.doesNotMatch(response.headers.get("set-cookie"), /(?:Max-Age|Expires)=/iu);
  assert.deepEqual(env.TRAIN_UNLOCK_LIMITER.keys, ["192.0.2.10"]);

  const access = await instance.fetch(request("/api/train/access", { headers: { cookie } }), env);
  assert.deepEqual(await access.json(), { unlocked: true,avatar:{label:"Test avatar"} });
  const avatar = await instance.fetch(request("/api/train/avatar", { headers: { cookie } }), env);
  assert.equal(avatar.status, 200);
  assert.equal(avatar.headers.get("content-type"), "model/gltf-binary");
  assert.equal(avatar.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.deepEqual(new Uint8Array(await avatar.arrayBuffer()), avatarBytes);

  const revoked = await instance.fetch(request("/api/train/access", {
    method: "DELETE",
    headers: { origin }
  }), env);
  assert.deepEqual(await revoked.json(), { unlocked: false });
  const clearedCookie = revoked.headers.get("set-cookie").split(";", 1)[0];
  const afterRevoke = await instance.fetch(request("/api/train/access", { headers: { cookie: clearedCookie } }), env);
  assert.deepEqual(await afterRevoke.json(), { unlocked: false });
});

test("rejects tampered and expired session tokens", async () => {
  const instance = worker();
  const env = environment();
  const response = await unlock(instance, env);
  const cookie = sessionCookie(response);
  const [name, token] = cookie.split("=", 2);
  const [payload, signature] = token.split(".");
  const tampered = `${name}=${payload}.${signature.slice(0, -1)}${signature.endsWith("a") ? "b" : "a"}`;
  const tamperedAccess = await instance.fetch(request("/api/train/access", { headers: { cookie: tampered } }), env);
  assert.deepEqual(await tamperedAccess.json(), { unlocked: false });
  const now = Math.floor(nowMs / 1000);
  const expired = await signedCookie({ v: 1, iat: now - 28_801, exp: now - 1 });
  const expiredAccess = await instance.fetch(request("/api/train/access", { headers: { cookie: expired } }), env);
  assert.deepEqual(await expiredAccess.json(), { unlocked: false });
});

test("fails closed for rate limits and missing secret configuration", async () => {
  const instance = worker();
  const limited = environment({ TRAIN_UNLOCK_LIMITER: limiter({ success: false }) });
  assert.equal((await unlock(instance, limited)).status, 429);
  assert.equal((await unlock(instance, environment({ TRAIN_UNLOCK_LIMITER: undefined }))).status, 503);

  const missingCode = environment({ AVATAR_UNLOCK_CODE: undefined });
  assert.equal((await unlock(instance, missingCode)).status, 503);
  assert.deepEqual(await (await instance.fetch(request("/api/train/access"), missingCode)).json(), { unlocked: false });
  assert.equal((await instance.fetch(request("/api/train/avatar"), missingCode)).status, 503);

  const missingKey = environment({ AVATAR_SESSION_KEY: undefined });
  assert.equal((await unlock(instance, missingKey)).status, 503);
  assert.equal((await instance.fetch(request("/api/train/avatar"), missingKey)).status, 503);
});

test("requires same-origin unlock and limits request bodies and methods", async () => {
  const instance = worker();
  const env = environment();
  const crossOrigin = await instance.fetch(request("/api/train/unlock", {
    method: "POST",
    headers: { origin: "https://attacker.test", "content-type": "application/json" },
    body: JSON.stringify({ code: unlockCode })
  }), env);
  assert.equal(crossOrigin.status, 403);
  assert.deepEqual(env.TRAIN_UNLOCK_LIMITER.keys, []);

  const tooLarge = await instance.fetch(request("/api/train/unlock", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ code: "x".repeat(1200) })
  }), env);
  assert.equal(tooLarge.status, 413);
  const wrongMethod = await instance.fetch(request("/api/train/avatar", { method: "POST" }), env);
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "GET");
});

test("unmatched paths use static assets and auth failures never leak asset bytes", async () => {
  const instance = worker();
  const env = environment();
  const staticResponse = await instance.fetch(request("/journey/"), env);
  assert.equal(await staticResponse.text(), "static asset");
  const privateResponse = await instance.fetch(request("/api/train/avatar"), env);
  const privateText = await privateResponse.text();
  assert.equal(privateResponse.status, 401);
  assert.equal(privateText.includes(Buffer.from(avatarBytes).toString("hex")), false);
  const unknownApi = await instance.fetch(request("/api/train/unknown"), env);
  assert.equal(await unknownApi.text(), "static asset");
});
