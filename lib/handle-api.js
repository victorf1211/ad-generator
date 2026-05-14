import {
  SYSTEM_PROMPT,
  callOpenAIImageEdit,
  callOpenAIImageGenerate,
  callOpenAIResponses,
  getOpenAIConfig,
  jsonResponse,
} from "./openai-api.js";

/**
 * @returns {Promise<Response | null>} Response if handled, null to fall through to static assets.
 */
export async function handleApiRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/health" && method === "GET") {
    return jsonResponse(200, { ok: true });
  }

  if (path === "/api/prompts" && method === "POST") {
    const cfg = getOpenAIConfig(env);
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { error: "Invalid JSON" });
    }
    const { productImageBase64, productImageMime } = body || {};
    if (!productImageBase64) {
      return jsonResponse(400, { error: "Missing product image" });
    }
    const userText = "请仅基于我上传的产品图进行类目识别与卖点推理，生成用于电商详情页配图的4段提示词。";
    const prompts = await callOpenAIResponses(cfg, {
      model: cfg.OPENAI_TEXT_MODEL,
      system: SYSTEM_PROMPT,
      userText,
      imageBase64: productImageBase64,
      imageMime: productImageMime,
    });
    return jsonResponse(200, { prompts });
  }

  if (path === "/api/generate" && method === "POST") {
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
  }

  return null;
}
