import { createServer } from './app.js'
import { loadConfig } from './config.js'

const config = loadConfig()
const server = createServer({ staticDir: config.staticDir })

server.on('error', (err) => {
  console.error(`[server] 启动失败：${err.message}`)
  process.exitCode = 1
})

server.listen(config.port, config.host, () => {
  const { address, port } = server.address()
  console.log(`[server] ${config.nodeEnv} 环境已启动，监听 http://${address}:${port}`)
  console.log(`[server] 静态资源目录：${config.staticDir}`)
})
