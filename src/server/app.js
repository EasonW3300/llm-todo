import { readFile, stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

/** 单页应用入口，未命中静态文件时回退到它。 */
const SPA_ENTRY = 'index.html'

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

/**
 * 创建请求处理函数：托管 staticDir 下的静态资源，未命中的前端路由回退到 index.html。
 * @param {{ staticDir: string }} options
 */
export function createRequestHandler({ staticDir }) {
  return async function handleRequest(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' })
      res.end()
      return
    }

    try {
      const filePath = await resolveFile(req.url, staticDir)
      if (!filePath) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(req.method === 'HEAD' ? undefined : '404 Not Found')
        return
      }
      await sendFile(req, res, filePath)
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(req.method === 'HEAD' ? undefined : '500 Internal Server Error')
      console.error(`[server] 处理 ${req.method} ${req.url} 失败：${err.message}`)
    }
  }
}

/**
 * 创建 HTTP 服务。
 * @param {{ staticDir: string }} options
 */
export function createServer({ staticDir }) {
  return http.createServer(createRequestHandler({ staticDir }))
}

/**
 * 把请求路径映射到磁盘文件；命中目录则取其 index.html。
 * 无扩展名的未命中路径视为前端路由，回退到 SPA 入口。
 * @returns {Promise<string|null>}
 */
async function resolveFile(rawUrl, staticDir) {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(rawUrl, 'http://localhost').pathname)
  } catch {
    return null // 非法 URI
  }

  const target = safeJoin(staticDir, pathname)
  if (target) {
    if (await isFile(target)) return target
    if (path.extname(pathname) === '') {
      const dirIndex = path.join(target, SPA_ENTRY)
      if (await isFile(dirIndex)) return dirIndex
    }
  }

  if (path.extname(pathname) !== '') return null // 缺失的静态资源不要回退成 HTML
  const fallback = path.join(staticDir, SPA_ENTRY)
  return (await isFile(fallback)) ? fallback : null
}

/** 拼接并校验路径，阻止逃逸出 staticDir。 */
function safeJoin(root, pathname) {
  const resolved = path.resolve(root, `.${pathname}`)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null
  return resolved
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}

async function sendFile(req, res, filePath) {
  const body = await readFile(filePath)
  res.writeHead(200, {
    'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': body.byteLength,
  })
  res.end(req.method === 'HEAD' ? undefined : body)
}
