const el = (id) => document.getElementById(id);

const state = {
  productImageBase64: null,
  productImageMime: null,
};

function setStatus(text, { error = false } = {}) {
  const s = el("status");
  s.textContent = text || "";
  s.className = error ? "status error" : "status";
}

function setBusy(busy) {
  el("btnPrompts").disabled = busy;
  el("btnImages").disabled = busy;
}

function splitIntoFourPrompts(raw) {
  const t = (raw || "").trim();
  if (!t) return [];
  const parts = t.split(/\n(?=图[一二三四]：)/g).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 4) return parts;
  // Fallback: try simple markers even without newlines
  const idx = ["图一：", "图二：", "图三：", "图四："].map((m) => t.indexOf(m));
  if (idx.some((v) => v < 0)) return [t];
  const slices = [];
  for (let i = 0; i < 4; i++) {
    const start = idx[i];
    const end = i === 3 ? t.length : idx[i + 1];
    slices.push(t.slice(start, end).trim());
  }
  return slices;
}

async function postJson(path, body) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `请求失败：${r.status}`);
  return data;
}

function readImageAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function b64FromDataUrl(dataUrl) {
  const m = String(dataUrl).match(/^data:(.+);base64,(.*)$/);
  if (!m) return null;
  return { mime: m[1], b64: m[2] };
}

el("imageInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const dataUrl = await readImageAsBase64(file);
  const { mime, b64 } = b64FromDataUrl(dataUrl) || {};
  state.productImageMime = mime || file.type || "image/png";
  state.productImageBase64 = b64 || null;

  const img = el("preview");
  img.src = dataUrl;
  img.style.display = "block";
  el("previewHint").style.display = "none";
});

el("btnPrompts").addEventListener("click", async () => {
  try {
    setBusy(true);
    setStatus("正在生成提示词…");
    if (!state.productImageBase64) throw new Error("请先上传产品图。");

    const data = await postJson("/api/prompts", {
      productImageBase64: state.productImageBase64,
      productImageMime: state.productImageMime,
    });

    el("prompts").value = data.prompts || "";
    setStatus("提示词已生成。你可以直接编辑后再生图。");
  } catch (err) {
    setStatus(err?.message || "生成提示词失败", { error: true });
  } finally {
    setBusy(false);
  }
});

function makeDownloadLink(b64, filename) {
  const a = document.createElement("a");
  a.href = b64.startsWith("http") ? b64 : `data:image/png;base64,${b64}`;
  a.download = filename;
  a.textContent = "下载";
  return a;
}

function addImageCard({ tag, srcForDisplay, sourceForDownload }) {
  const wrap = document.createElement("div");
  wrap.className = "imgCard";

  const img = document.createElement("img");
  img.src = srcForDisplay;
  img.alt = tag;

  const meta = document.createElement("div");
  meta.className = "imgMeta";

  const t = document.createElement("div");
  t.className = "tag";
  t.textContent = tag;

  const dl = makeDownloadLink(sourceForDownload, `${tag}.png`);

  meta.appendChild(t);
  meta.appendChild(dl);

  wrap.appendChild(img);
  wrap.appendChild(meta);
  el("images").appendChild(wrap);
}

el("btnImages").addEventListener("click", async () => {
  try {
    setBusy(true);
    el("images").innerHTML = "";

    const raw = el("prompts").value;
    const prompts = splitIntoFourPrompts(raw);
    if (!prompts.length) throw new Error("请先生成或粘贴提示词。");

    if (!state.productImageBase64) {
      setStatus("未上传产品图：将仅用提示词生成（不含产品图条件）。");
    } else {
      setStatus("正在生成图片（会逐张输出）…");
    }

    for (let i = 0; i < prompts.length; i++) {
      const tag = `图${["一", "二", "三", "四"][i] || i + 1}`;
      setStatus(`正在生成：${tag}（${i + 1}/${prompts.length}）…`);

      const { imageBase64, imageUrl } = await postJson("/api/generate", {
        prompt: prompts[i],
        productImageBase64: state.productImageBase64,
        productImageMime: state.productImageMime,
      });

      if (!imageBase64 && !imageUrl) {
        throw new Error("生图成功但未返回可用图片数据（base64/url）。");
      }
      const srcForDisplay = imageBase64 ? `data:image/png;base64,${imageBase64}` : imageUrl;
      const sourceForDownload = imageBase64 || imageUrl;
      addImageCard({ tag, srcForDisplay, sourceForDownload });
    }

    setStatus("完成：已生成全部图片。");
  } catch (err) {
    setStatus(err?.message || "生成图片失败", { error: true });
  } finally {
    setBusy(false);
  }
});

