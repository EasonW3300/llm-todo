/**
 * src/server/db/migrate.js 契约测试：SQLite 迁移。
 *
 * 约定的接口：
 *   migrate(db) -> number   应用未执行的迁移，返回应用后的 schema 版本
 * schema 版本记录在 SQLite 的 PRAGMA user_version 上，重复调用不会重复执行迁移。
 *
 * 所有连接都在 finally 里 await closeDatabase()，保证释放后再开下一条连接。
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { closeDatabase, openDatabase } from '../src/server/db/index.js'
import { migrate } from '../src/server/db/migrate.js'

let dir
let seq = 0
async function tempDbPath() {
  dir ??= await mkdtemp(path.join(tmpdir(), 'llm-todo-migrate-'))
  return path.join(dir, `db-${++seq}.sqlite`)
}

after(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

test('migrate 返回的版本与 PRAGMA user_version 一致', async () => {
  const db = openDatabase(await tempDbPath())
  try {
    const version = migrate(db)
    assert.ok(Number.isInteger(version) && version >= 1, `期望版本 >= 1，实际 ${version}`)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, version)
  } finally {
    await closeDatabase(db)
  }
})

test('schema 版本写入磁盘', async () => {
  const file = await tempDbPath()

  const db = openDatabase(file)
  let version
  try {
    version = migrate(db)
  } finally {
    await closeDatabase(db)
  }

  // 连接关掉后重新打开：读到的仍是同一版本，说明版本写在文件里。
  const reopened = openDatabase(file)
  try {
    assert.equal(reopened.prepare('PRAGMA user_version').get().user_version, version)
  } finally {
    await closeDatabase(reopened)
  }
})

test('重复执行 migrate 是幂等的', async () => {
  const db = openDatabase(await tempDbPath())
  try {
    const first = migrate(db)
    const second = migrate(db)

    assert.equal(second, first)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, first)
  } finally {
    await closeDatabase(db)
  }
})

test('内存库同样可以迁移', async () => {
  const db = openDatabase(':memory:')
  try {
    const version = migrate(db)
    assert.ok(version >= 1)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, version)
  } finally {
    await closeDatabase(db)
  }
})
