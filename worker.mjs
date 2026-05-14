import { handleApiRequest } from "./lib/handle-api.js";
import { jsonResponse } from "./lib/openai-api.js";

export default {
  async fetch(request, env, ctx) {
    try {
      const api = await handleApiRequest(request, env);
      if (api) return api;
      return env.ASSETS.fetch(request);
    } catch (err) {
      return jsonResponse(500, { error: err?.message || "Server error" });
    }
  },
};
