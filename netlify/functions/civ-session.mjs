// Durable recovery endpoint for Civilization: A New Dawn multiplayer.
// Live actions remain peer-to-peer; this function is the revision/lease authority.

import { getStore } from "@netlify/blobs";
import {
  MAX_RECORD_BYTES,
  SessionError,
  createSessionService
} from "./civ-session-core.mjs";

const STORE_NAME = "civ-new-dawn-sessions-v2";
const GAME_ID_RE = /^[A-Za-z0-9_-]{8,96}$/;

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function gameIdFromRequest(request, context) {
  const fromContext = context?.params?.gameId;
  if (typeof fromContext === "string") return fromContext;
  let part = "";
  try {
    const pieces = new URL(request.url).pathname.split("/").filter(Boolean);
    part = decodeURIComponent(pieces[pieces.length - 1] || "");
  } catch {
    return "";
  }
  return part;
}

async function readBody(request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RECORD_BYTES) {
    throw new SessionError("payload_too_large", `Request exceeds ${MAX_RECORD_BYTES} bytes`, 413);
  }
  const contentType = request.headers.get("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new SessionError("unsupported_media_type", "Content-Type must be application/json", 415);
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_RECORD_BYTES) {
    throw new SessionError("payload_too_large", `Request exceeds ${MAX_RECORD_BYTES} bytes`, 413);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new SessionError("invalid_json", "Request body is not valid JSON", 400);
  }
}

export default async function handler(request, context) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
  }
  if (request.method !== "POST") {
    return response({ ok: false, code: "method_not_allowed", message: "Use POST" }, 405);
  }

  try {
    const gameId = gameIdFromRequest(request, context);
    if (!GAME_ID_RE.test(gameId)) {
      throw new SessionError("invalid_game_id", "gameId has an invalid format", 400);
    }
    const body = await readBody(request);
    // Store-level strong consistency applies to every read, and the core still
    // requests it per operation so test adapters and future refactors stay safe.
    const store = getStore({ name: STORE_NAME, consistency: "strong" });
    const service = createSessionService({ store });
    return response(await service.dispatch(gameId, body));
  } catch (error) {
    if (error instanceof SessionError) {
      return response({ ok: false, code: error.code, message: error.message }, error.status);
    }
    console.error("civ-session", error);
    return response({
      ok: false,
      code: "storage_unavailable",
      message: "The multiplayer backup is temporarily unavailable"
    }, 503);
  }
}

export const config = { path: "/api/civ-session/:gameId" };

export const internals = { gameIdFromRequest, readBody, response };
