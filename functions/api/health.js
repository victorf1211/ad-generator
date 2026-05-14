import { jsonResponse } from "../../lib/openai-api.js";

export async function onRequestGet() {
  return jsonResponse(200, { ok: true });
}
