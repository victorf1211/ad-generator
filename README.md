# AI Product Ad Generator (Local)

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

