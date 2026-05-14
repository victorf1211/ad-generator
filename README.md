# AI Product Ad Generator

本地用 `node server.mjs`。

部署二选一（不要混用同一域名上两套互不认识的配置）：

## A) Cloudflare Workers（`wrangler deploy` / 仓库里的 Workers 集成）

- 使用根目录 **`worker.mjs`** + **`wrangler.jsonc`**：先匹配 **`/api/*`**，其余走静态资源 **`public/`**。
- 在 Cloudflare 控制台为该 Worker 配置环境变量：**`OPENAI_API_KEY`**（必填）、可选 **`OPENAI_BASE_URL`**、**`OPENAI_TEXT_MODEL`**。
- 部署：`npm run deploy` 或在 Cloudflare 用 Git 触发 Workers 构建。
- 本地预览：`npm run preview`（`wrangler dev`）。

## B) Cloudflare Pages

- **Build command:** `npm run build`，**Build output directory:** `dist`，仓库根目录需包含 **`functions/`**（Pages Functions）。
- 环境变量同上（在 **Pages** 项目里配置，不是 Worker 里）。
- 本地：`npm run pages:dev`。

---

若线上仍出现 **`/api/...` 404**：说明你打开的域名指向的是 **只有静态资源、没有跑 `worker.mjs` 也没有 Pages Functions** 的那一种部署。请对照上表确认该域名对应的是 **Workers（已含 worker）** 还是 **Pages（已含 functions）**，并在正确的产品里配置密钥后重新部署。

## 本地运行

一个本地可跑的小网站：

- 上传产品图
- 根据你提供的**严格系统 prompt**生成 4 段中文生图提示词（图一～图四）
- 基于提示词 + 产品图生成 4 张电商广告图（如果“图像编辑”不可用，会自动降级为纯提示词生成）

## 运行

1) 设置环境变量（必填）：

```bash
export OPENAI_API_KEY="你的key"
```

可选（默认 `gpt-4.1-mini`）：

```bash
export OPENAI_TEXT_MODEL="gpt-4.1-mini"
```

2) 启动服务：

```bash
node server.mjs
```

3) 打开：

`http://localhost:3000`

## 接口

- `POST /api/prompts`：根据产品信息生成 4 段提示词
- `POST /api/generate`：根据提示词（和可选产品图）生成图片（返回 base64）

