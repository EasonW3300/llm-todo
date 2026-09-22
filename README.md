# LLM-todo

单页前端 + Node 服务端的项目骨架。服务端零运行时依赖，只用 Node 内置模块。

## 环境要求

Node.js >= 20.12。

## 快速开始

```bash
cp .env.example .env   # 按需修改
npm start              # 默认 http://0.0.0.0:3000
npm test               # node:test
```

## 目录结构

```
src/server/index.js    进程入口：装载配置、启动 HTTP 服务
src/server/config.js   环境变量装载与配置解析（含 .env 解析）
src/server/app.js      HTTP 服务：单页静态托管 + 前端路由回退
test/                  node:test 测试
```

## 环境变量

见 `.env.example`。优先级：显式传入的 env > `.env` 文件 > 内置默认值。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `development` | 运行环境 |
| `PORT` | `3000` | 监听端口，`0` 表示随机端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `STATIC_DIR` | `public` | 单页前端产物目录；相对路径按仓库根目录解析 |

`.env` 只被读取解析，不会写入 `process.env`。

## 静态托管行为

把单页前端产物放进 `STATIC_DIR`（默认 `public/`，至少包含 `index.html`）：

- 命中静态文件时按扩展名返回对应的 `Content-Type`；
- 请求目录时返回该目录下的 `index.html`；
- 未命中且路径**无扩展名**时视为前端路由，回退到 `index.html`；
- 未命中且路径**带扩展名**时返回 `404`，避免把缺失的 JS/CSS 当成 HTML 返回；
- 仅允许 `GET` / `HEAD`，其余方法返回 `405`。
