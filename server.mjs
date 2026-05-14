import http from "node:http";
import { stat } from "node:fs/promises";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { callOpenAIResponses as callOpenAIResponsesShared } from "./lib/openai-api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, "..");

function loadDotEnv() {
  const envPath = join(__dirname, ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;

    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (!key) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

const PORT = Number(process.env.PORT || 3000);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://ai.t8star.cn").replace(/\/+$/, "");

const SYSTEM_PROMPT = `你必须严格遵守：只输出生图提示词本体（中文），不要输出代码块、清单编号（除图号外）、解释、总结或与提示词无关的内容。必须输出4段提示词，每段开头依次为“图一：”、“图二：”、“图三：”、“图四：”。每段内部必须包含并按换行输出以下5项，顺序固定且每项都要写满写具体：主标题：…；副标题：…；信息布局：…；排版形式：…；风格与素材：…。主标题与副标题必须是中文短句，避免空泛词堆砌。信息布局必须写清楚标题/副标题/卖点/参数/按钮/留白的相对位置与层级（例如：顶端居左/居中/居右、底部购买区、左右分栏、分镜、网格、指示线等）。排版形式必须写清楚字体风格（衬线/无衬线/手写感/极简）、字重、字号层级、颜色（如香槟金/高级灰/暗金）、对齐方式与留白逻辑。风格与素材必须写得像顶级商业摄影分镜与场景搭建说明，必须包含：具体场景地点、时间与气氛、主体姿态/动作/表情、至少3个具体道具、镜头语言（机位/景别/焦段或大光圈浅景深）、光源方向与质感（柔光/侧逆光/轮廓光/补光）、材质细节（纹理/光泽/工艺点）、色调与后期质感（电影级、颗粒/对比/层次），并明确无白底。整体要比“普通提示词”更丰富更具体，避免泛泛而谈；可以写长段落。除这4段外不要输出任何内容。`;

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function sanitizePath(urlPath) {
  const p = urlPath.split("?")[0];
  if (p.includes("..")) return null;
  return p === "/" ? "/index.html" : p;
}

const mimeByExt = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

async function readBody(req) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseJsonBody(buf) {
  try {
    return JSON.parse(buf.toString("utf-8"));
  } catch {
    return null;
  }
}

async function safeFetch(url, options, label) {
  try {
    return await fetch(url, options);
  } catch (err) {
    const cause = err?.cause?.message ? ` | cause: ${err.cause.message}` : "";
    throw new Error(`${label} network error at ${url}: ${err?.message || "fetch failed"}${cause}`);
  }
}

function parseImageResult(data) {
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
    throw new Error(
      "Image API did not include b64_json/image_base64/url fields."
    );
  }
  return { imageBase64, imageUrl };
}

async function callOpenAIResponses(args) {
  return callOpenAIResponsesShared(
    {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_BASE_URL,
      OPENAI_TEXT_MODEL: process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini",
    },
    args
  );
}

async function callOpenAIImageEdit({ prompt, imageBase64, imageMime }) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in environment.");
  }

  const form = new FormData();
  form.set("model", "gpt-image-1");
  form.set("prompt", prompt);
  // If the model supports it, this nudges toward ad-like output.
  form.set("size", "1024x1024");
  form.set("background", "transparent");

  const bin = Buffer.from(imageBase64, "base64");
  const blob = new Blob([bin], { type: imageMime || "image/png" });
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

async function callOpenAIImageGenerate({ prompt }) {
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

const server = http.createServer(async (req, res) => {
  try {
    const { method, url } = req;
    if (!url) return sendText(res, 400, "Bad request");

    if (url === "/api/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (url === "/api/prompts" && method === "POST") {
      const buf = await readBody(req);
      const body = parseJsonBody(buf);
      if (!body) return sendJson(res, 400, { error: "Invalid JSON" });

      const { productImageBase64, productImageMime } = body;
      if (!productImageBase64) {
        return sendJson(res, 400, { error: "Missing product image" });
      }

      const userText = "请仅基于我上传的产品图进行类目识别与卖点推理，生成用于电商详情页配图的4段提示词。";

      const prompts = await callOpenAIResponses({
        model: process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini",
        system: SYSTEM_PROMPT,
        userText,
        imageBase64: productImageBase64,
        imageMime: productImageMime,
      });

      return sendJson(res, 200, { prompts });
    }

    if (url === "/api/generate" && method === "POST") {
      const buf = await readBody(req);
      const body = parseJsonBody(buf);
      if (!body) return sendJson(res, 400, { error: "Invalid JSON" });

      const { prompt, productImageBase64, productImageMime } = body;
      if (!prompt) return sendJson(res, 400, { error: "Missing prompt" });

      let imageResult;
      if (productImageBase64) {
        try {
          imageResult = await callOpenAIImageEdit({
            prompt,
            imageBase64: productImageBase64,
            imageMime: productImageMime,
          });
        } catch (e) {
          // Fallback: generate without conditioning on product image.
          imageResult = await callOpenAIImageGenerate({ prompt });
        }
      } else {
        imageResult = await callOpenAIImageGenerate({ prompt });
      }

      return sendJson(res, 200, imageResult);
    }

    // Static file serving
    if (method === "GET") {
      const safe = sanitizePath(url);
      if (!safe) return sendText(res, 400, "Bad path");
      const filePath = join(__dirname, "public", safe);

      try {
        const s = await stat(filePath);
        if (!s.isFile()) return sendText(res, 404, "Not found");
      } catch {
        return sendText(res, 404, "Not found");
      }

      const ext = extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": mimeByExt[ext] || "application/octet-stream" });
      createReadStream(filePath).pipe(res);
      return;
    }

    sendText(res, 404, "Not found");
  } catch (err) {
    sendJson(res, 500, { error: err?.message || "Server error" });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://localhost:${PORT}`);
});

