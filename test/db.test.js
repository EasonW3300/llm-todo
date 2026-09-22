/**
 * src/server/db/index.js 契约测试：SQLite 连接的打开与关闭。
 *
 * 约定的接口：
 *   DEFAULT_DB_PATH                       默认库文件的绝对路径
 *   openDatabase(filePath = DEFAULT_DB_PATH) -> DatabaseSync（建库建表、外键开启）
 *   closeDatabase(db)                    关闭连接
 * schema 版本用 SQLite 的 PRAGMA user_version 记录。
 *
 * 每个连接都在 finally 里 await closeDatabase()：closeDatabase 无论同步还是异步实现
 * 都能保证连接已经释放，避免下一条连接在本进程内等锁。
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { DEFAULT_DB_PATH, closeDatabase, openDatabase } from '../src/server/db/index.js'

let dir
let seq = 0
async function tempDbPath() {
  dir ??= await mkdtemp(path.join(tmpdir(), 'llm-todo-db-'))
  return path.join(dir, `db-${++seq}.sqlite`)
}

after(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

test('DEFAULT_DB_PATH 是绝对路径', () => {
  assert.equal(typeof DEFAULT_DB_PATH, 'string')
  assert.ok(DEFAULT_DB_PATH.length > 0)
  assert.ok(path.isAbsolute(DEFAULT_DB_PATH), `期望绝对路径，实际 ${DEFAULT_DB_PATH}`)
})

test('打开内存库返回可用的连接', async () => {
  const db = openDatabase(':memory:')
  try {
    assert.ok(db.prepare('PRAGMA user_version').get(), 'PRAGMA user_version 应当返回一行')
  } finally {
    await closeDatabase(db)
  }
})

test('打开文件库会建表并把 schema 版本落盘', async () => {
  const file = await tempDbPath()

  const db = openDatabase(file)
  let version
  try {
    version = db.prepare('PRAGMA user_version').get().user_version
  } finally {
    await closeDatabase(db)
  }
  assert.ok(version >= 1, `打开后 schema 版本应 >= 1，实际 ${version}`)

  // 连接关掉后重新打开：读到的仍是同一版本，且表还在，说明这些都写在文件里。
  const reopened = openDatabase(file)
  try {
    assert.equal(reopened.prepare('PRAGMA user_version').get().user_version, version)
    const tables = reopened
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name)
    assert.ok(tables.includes('tasks'), `建表后应包含 tasks，实际 ${tables.join(', ')}`)
  } finally {
    await closeDatabase(reopened)
  }
})

test('closeDatabase 之后连接不可用', async () => {
  const db = openDatabase(await tempDbPath())
  await closeDatabase(db)

  assert.throws(() => db.prepare('PRAGMA user_version').get())
})

test('同一文件可以先后打开两次', async () => {
  const file = await tempDbPath()

  const first = openDatabase(file)
  await closeDatabase(first)

  const second = openDatabase(file)
  try {
    assert.ok(second.prepare('PRAGMA user_version').get().user_version >= 1)
  } finally {
    await closeDatabase(second)
  }
})
