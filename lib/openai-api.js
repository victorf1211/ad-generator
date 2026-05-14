/**
 * Shared OpenAI / gateway logic for Cloudflare Pages Functions (Workers runtime).
 * Mirrors server.mjs behavior without Node http/fs.
 */

export const SYSTEM_PROMPT = `你必须严格遵守：只输出生图提示词本体（中文），不要输出代码块、清单编号（除图号外）、解释、总结或与提示词无关的内容。必须输出4段提示词，每段开头依次为“图一：”、“图二：”、“图三：”、“图四：”。每段内部必须包含并按换行输出以下5项，顺序固定且每项都要写满写具体：主标题：…；副标题：…；信息布局：…；排版形式：…；风格与素材：…。主标题与副标题必须是中文短句，避免空泛词堆砌。信息布局必须写清楚标题/副标题/卖点/参数/按钮/留白的相对位置与层级（例如：顶端居左/居中/居右、底部购买区、左右分栏、分镜、网格、指示线等）。排版形式必须写清楚字体风格（衬线/无衬线/手写感/极简）、字重、字号层级、颜色（如香槟金/高级灰/暗金）、对齐方式与留白逻辑。风格与素材必须写得像顶级商业摄影分镜与场景搭建说明，必须包含：具体场景地点、时间与气氛、主体姿态/动作/表情、至少3个具体道具、镜头语言（机位/景别/焦段或大光圈浅景深）、光源方向与质感（柔光/侧逆光/轮廓光/补光）、材质细节（纹理/光泽/工艺点）、色调与后期质感（电影级、颗粒/对比/层次），并明确无白底。整体要比“普通提示词”更丰富更具体，避免泛泛而谈；可以写长段落。除这4段外不要输出任何内容。`;

export function getOpenAIConfig(env) {
  const OPENAI_API_KEY = env.OPENAI_API_KEY;
  const OPENAI_BASE_URL = (env.OPENAI_BASE_URL || "https://ai.t8star.cn").replace(/\/+$/, "");
  const OPENAI_TEXT_MODEL = env.OPENAI_TEXT_MODEL || "gpt-4.1-mini";
  return { OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_TEXT_MODEL };
}

export async function safeFetch(url, options, label) {
  try {
    return await fetch(url, options);
  } catch (err) {
    const cause = err?.cause?.message ? ` | cause: ${err.cause.message}` : "";
    throw new Error(`${label} network error at ${url}: ${err?.message || "fetch failed"}${cause}`);
  }
}

export function parseImageResult(data) {
  const first = data?.data?.[0] || data?.result?.images?.[0] || null;
  if (!first) {
    throw new Error("Image API returned no image items.");
  }

  const imageBase64 =
    first?.b64_json ||
    first?.image_base64 ||
    first?.base64 ||
    first?.image_b64 ||
    null;
  const imageUrl = first?.url || first?.image_url || null;

  if (!imageBase64 && !imageUrl) {
    throw new Error("Image API did not include b64_json/image_base64/url fields.");
  }
  return { imageBase64, imageUrl };
}

function base64ToBlob(imageBase64, imageMime) {
  const binaryString = atob(imageBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: imageMime || "image/png" });
}

export async function callOpenAIResponses(
  { OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_TEXT_MODEL },
  { model, system, userText, imageBase64, imageMime }
) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in environment.");
  }

  const userContent = [];
  if (userText) {
    userContent.push({ type: "input_text", text: userText });
  }
  if (imageBase64) {
    userContent.push({
      type: "input_image",
      image_url: `data:${imageMime || "image/png"};base64,${imageBase64}`,
    });
  }
  if (!userContent.length) {
    throw new Error("Missing user input for prompt generation.");
  }

  const m = model || OPENAI_TEXT_MODEL;

  const r = await safeFetch(`${OPENAI_BASE_URL}/v1/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: m,
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: userContent },
      ],
    }),
  }, "responses");

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || data?.message || `OpenAI error (${r.status})`;
    const unsupportedResponsesPath =
      msg.includes("/v1/responses") ||
      msg.includes("不支持此 API 路径") ||
      msg.toLowerCase().includes("not support") ||
      msg.toLowerCase().includes("unsupported");

    if (!unsupportedResponsesPath) {
      throw new Error(msg);
    }

    const messages = [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          ...(userText ? [{ type: "text", text: userText }] : []),
          ...(imageBase64
            ? [
                {
                  type: "image_url",
                  image_url: { url: `data:${imageMime || "image/png"};base64,${imageBase64}` },
                },
              ]
            : []),
        ],
      },
    ];

    try {
      const fallbackResp = await safeFetch(
        `${OPENAI_BASE_URL}/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: m,
            messages,
          }),
        },
        "chat.completions"
      );

      const fallbackData = await fallbackResp.json().catch(() => ({}));
      if (!fallbackResp.ok) {
        const fallbackMsg =
          fallbackData?.error?.message || fallbackData?.message || `Chat completion error (${fallbackResp.status})`;
        throw new Error(fallbackMsg);
      }

      const fallbackText = fallbackData?.choices?.[0]?.message?.content;
      if (!fallbackText) throw new Error("No content returned from chat/completions.");
      return fallbackText;
    } catch (fallbackErr) {
      const fallbackMsg = fallbackErr?.message || "";
      const looksLikeGatewayClosed =
        fallbackMsg.includes("other side closed") ||
        fallbackMsg.includes("fetch failed") ||
        fallbackMsg.toLowerCase().includes("socket hang up");

      if (looksLikeGatewayClosed && imageBase64) {
        const textOnlyMessages = [
          { role: "system", content: system },
          {
            role: "user",
            content:
              "请仅输出4段提示词。网关不支持图像输入，请根据常见电商产品图进行合理推理并保持高端广告风格。\n" +
              (userText || ""),
          },
        ];
        const textOnlyResp = await safeFetch(
          `${OPENAI_BASE_URL}/v1/chat/completions`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: m,
              messages: textOnlyMessages,
            }),
          },
          "chat.completions(text-only retry)"
        );
        const textOnlyData = await textOnlyResp.json().catch(() => ({}));
        if (!textOnlyResp.ok) {
          const textOnlyMsg =
            textOnlyData?.error?.message ||
            textOnlyData?.message ||
            `Chat completion text-only error (${textOnlyResp.status})`;
          throw new Error(textOnlyMsg);
        }
        const textOnly = textOnlyData?.choices?.[0]?.message?.content;
        if (!textOnly) throw new Error("No content returned from chat/completions text-only retry.");
        return textOnly;
      }

      throw fallbackErr;
    }
  }
  const text = data?.output_text;
  if (!text) throw new Error("No output_text returned from OpenAI.");
  return text;
}

export async function callOpenAIImageEdit(cfg, { prompt, imageBase64, imageMime }) {
  const { OPENAI_API_KEY, OPENAI_BASE_URL } = cfg;
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in environment.");
  }

  const form = new FormData();
  form.set("model", "gpt-image-1");
  form.set("prompt", prompt);
  form.set("size", "1024x1024");
  form.set("background", "transparent");

  const blob = base64ToBlob(imageBase64, imageMime);
  form.set("image", blob, `product${imageMime === "image/jpeg" ? ".jpg" : ".png"}`);

  const r = await safeFetch(`${OPENAI_BASE_URL}/v1/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  }, "images.edits");

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `OpenAI image edit error (${r.status})`;
    throw new Error(msg);
  }

  return parseImageResult(data);
}

export async function callOpenAIImageGenerate(cfg, { prompt }) {
  const { OPENAI_API_KEY, OPENAI_BASE_URL } = cfg;
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in environment.");
  }

  const r = await safeFetch(`${OPENAI_BASE_URL}/v1/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
    }),
  }, "images.generations");

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `OpenAI image generate error (${r.status})`;
    throw new Error(msg);
  }

  return parseImageResult(data);
}

export function jsonResponse(status, obj) {
  const body = JSON.stringify(obj);
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
