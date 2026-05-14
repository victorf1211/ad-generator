# Ad Generator — AI E‑Commerce Creative Assistant

A full-stack web app that turns a **single product photo** into **four structured Chinese image prompts** and **four ad-style product images**, aimed at e‑commerce detail pages and campaign creatives.

**Portfolio / resume note:** Demonstrates multimodal LLM integration (vision + text), image generation APIs, a small vanilla front end, a Node.js dev server, and production deployment on **Cloudflare** (Workers with static assets or Pages + Functions) with shared serverless API logic.

---

## Features

- **Product image upload** in the browser (base64 to the API).
- **Four-scene prompt pack** — strict system instructions so the model outputs four labeled sections (图一 … 图四) with layout, typography, and visual direction in Chinese.
- **Four images** — calls an OpenAI-compatible **images/edits** flow when a product image is present, with **automatic fallback** to **images/generations** if edit fails or the gateway drops multimodal payloads.
- **Gateway resilience** — tries `/v1/responses`, then falls back to `/v1/chat/completions`, with an optional text-only retry path when the upstream closes on image payloads.

---

## Tech Stack

| Layer | Choice |
|--------|--------|
| Front end | HTML, CSS, vanilla JavaScript (`public/`) |
| Local API + static | Node.js **HTTP** server (`server.mjs`, ES modules) |
| Production API | **Cloudflare Workers** (`worker.mjs`) *or* **Pages Functions** (`functions/`) |
| Shared API logic | `lib/openai-api.js`, `lib/handle-api.js` |
| Tooling | `npm`, **Wrangler** 4.x |

---

## Architecture (high level)

```text
Browser (public/)
    │  POST /api/prompts , POST /api/generate
    ▼
┌─────────────────────────────────────────┐
│  Local: server.mjs                      │
│  Cloudflare Worker: worker.mjs + ASSETS │
│  Cloudflare Pages: functions/api/*      │
└─────────────────────────────────────────┘
    │  HTTPS to OpenAI-compatible base URL
    ▼
  Upstream LLM + image APIs
```

Secrets never ship to the client: **`OPENAI_API_KEY`** lives in **environment variables** (local shell, `.dev.vars` for Wrangler, or Cloudflare dashboard).

---

## Prerequisites

- **Node.js 18+**
- An **OpenAI-compatible API key** (and base URL if not using the default host).

---

## Local development

```bash
cd ad-generator   # or your clone path
export OPENAI_API_KEY="your-key"   # Windows: set OPENAI_API_KEY=...
# optional:
# export OPENAI_BASE_URL="https://your-gateway.example"
# export OPENAI_TEXT_MODEL="gpt-4.1-mini"

npm install
npm start          # runs node server.mjs — http://localhost:3000
```

---

## Environment variables

| Variable | Required | Description |
|-----------|----------|-------------|
| `OPENAI_API_KEY` | **Yes** | Bearer token for the upstream API. |
| `OPENAI_BASE_URL` | No | OpenAI-compatible root URL (no trailing slash). Default matches project config. |
| `OPENAI_TEXT_MODEL` | No | Text / vision model for prompt generation (default `gpt-4.1-mini`). |

---

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Liveness check (`{ "ok": true }`). |
| `POST` | `/api/prompts` | JSON body: `productImageBase64`, `productImageMime` → `{ "prompts": "..." }`. |
| `POST` | `/api/generate` | JSON body: `prompt`, optional `productImageBase64` / `productImageMime` → `{ imageBase64 \| imageUrl, ... }`. |

---

## Deploy on Cloudflare

Use **one** primary target per hostname so routes and env vars line up.

### Option A — Workers (`wrangler deploy` / Git → Workers)

- Entry: **`worker.mjs`**; static files: **`public/`** via **`ASSETS`** in **`wrangler.jsonc`** (`run_worker_first`: API routes win, then assets).
- Set **`OPENAI_API_KEY`** (and optional vars) under the Worker → **Settings → Variables**.
- Deploy: `npm run deploy` or your connected Git pipeline. Preview locally: `npm run preview`.

### Option B — Pages

- **Build command:** `npm run build`  
- **Output directory:** `dist`  
- **Pages Functions:** `functions/` (thin handlers calling **`lib/handle-api.js`**).
- Set the same variables on the **Pages** project, not only on a separate Worker.

---

## Scripts (`package.json`)

| Script | Command |
|--------|---------|
| `npm start` | `node server.mjs` |
| `npm run build` | Copy `public/` → `dist/` for Pages static output |
| `npm run pages:dev` | Build + `wrangler pages dev dist` |
| `npm run preview` | `wrangler dev` (Worker + assets) |
| `npm run deploy` | `wrangler deploy` |

For Wrangler locally, you can use **`.dev.vars`** (git-ignored) with `OPENAI_API_KEY=...`.

---

## Repository layout

```text
public/           # Front-end assets
server.mjs        # Local Node server (static + API)
worker.mjs        # Cloudflare Worker entry (API + ASSETS)
functions/api/    # Pages Functions (optional Pages deploy)
lib/              # Shared OpenAI gateway + route handler
wrangler.jsonc    # Worker + assets config
example/          # Sample creative assets (optional)
```

---

## Live demo

https://ad.victorfeng.cc.cd/

---