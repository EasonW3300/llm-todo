import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/** 仓库根目录（src/server/config.js 上溯两级）。 */
const repoRoot = path.resolve(import.meta.dirname, '..', '..')

const DEFAULTS = {
  nodeEnv: 'development',
  host: '0.0.0.0',
  port: 3000,
  staticDir: 'public',
}

/**
 * 解析 .env 文件并返回键值对。文件不存在返回空对象；格式错误抛出带行号的错误。
 * 只读取，不改写 process.env。
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
export function loadEnvFile(filePath) {
  let content
  try {
    content = readFileSync(filePath, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return {}
    throw new Error(`无法读取 env 文件 ${filePath}：${err.message}`)
  }

  const values = {}
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '' || line.startsWith('#')) continue

    const separator = line.indexOf('=')
    if (separator === -1) {
      throw new Error(`env 文件格式错误：${filePath}:${i + 1} 缺少 "="`)
    }

    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    values[key] = stripQuotes(value)
  }
  return values
}

/**
 * 把环境变量解析成运行时配置。
 * @param {NodeJS.ProcessEnv} env
 */
export function readConfig(env = process.env) {
  const staticDir = env.STATIC_DIR || DEFAULTS.staticDir
  return {
    nodeEnv: env.NODE_ENV || DEFAULTS.nodeEnv,
    host: env.HOST || DEFAULTS.host,
    port: parsePort(env.PORT),
    // 相对路径按仓库根目录解析，绝对路径原样使用
    staticDir: path.isAbsolute(staticDir) ? staticDir : path.resolve(repoRoot, staticDir),
  }
}

/**
 * 装载 .env 后读取配置——进程入口使用。
 * 优先级：显式传入的 env > .env 文件 > 内置默认值。
 * @param {{ envFile?: string, env?: NodeJS.ProcessEnv }} [options]
 */
export function loadConfig({ envFile = path.join(repoRoot, '.env'), env = process.env } = {}) {
  return readConfig({ ...loadEnvFile(envFile), ...env })
}

function stripQuotes(value) {
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  return quoted && value.length >= 2 ? value.slice(1, -1) : value
}

function parsePort(value) {
  if (value === undefined || value === '') return DEFAULTS.port
  const port = Number(value)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`无效的 PORT：${value}（期望 0-65535 的整数）`)
  }
  return port
}
