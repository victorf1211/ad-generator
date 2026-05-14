import {
  callOpenAIImageEdit,
  callOpenAIImageGenerate,
  getOpenAIConfig,
  jsonResponse,
} from "../../lib/openai-api.js";

export async function onRequestPost({ request, env }) {
  try {
    const cfg = getOpenAIConfig(env);
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { error: "Invalid JSON" });
    }

    const { prompt, productImageBase64, productImageMime } = body || {};
    if (!prompt) return jsonResponse(400, { error: "Missing prompt" });

    let imageResult;
    if (productImageBase64) {
      try {
        imageResult = await callOpenAIImageEdit(cfg, {
          prompt,
          imageBase64: productImageBase64,
          imageMime: productImageMime,
        });
      } catch {
        imageResult = await callOpenAIImageGenerate(cfg, { prompt });
      }
    } else {
      imageResult = await callOpenAIImageGenerate(cfg, { prompt });
    }

    return jsonResponse(200, imageResult);
  } catch (err) {
    return jsonResponse(500, { error: err?.message || "Server error" });
  }
}
