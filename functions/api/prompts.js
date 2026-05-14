import {
  SYSTEM_PROMPT,
  callOpenAIResponses,
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
  } catch (err) {
    return jsonResponse(500, { error: err?.message || "Server error" });
  }
}
