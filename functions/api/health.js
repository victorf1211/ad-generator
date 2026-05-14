import { handleApiRequest } from "../../lib/handle-api.js";
import { jsonResponse } from "../../lib/openai-api.js";

export async function onRequestGet({ request, env }) {
  try {
    const r = await handleApiRequest(request, env);
    return r || jsonResponse(404, { error: "Not found" });
  } catch (err) {
    return jsonResponse(500, { error: err?.message || "Server error" });
  }
}
