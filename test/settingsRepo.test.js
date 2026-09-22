/**
 * src/server/db/settingsRepo.js 契约测试：API 密钥材料与模型配置的存取。
 *
 * 约定的接口：
 *   createSettingsRepo(db) -> {
 *     saveApiKey({ ciphertext, iv, tag, hint }), getApiKey(), clearApiKey(),
 *     saveModelConfig({ base_url, model }), getModelConfig(),
 *   }
 * 密钥表字段：api_key_ciphertext、api_key_iv、api_key_tag、key_hint（只存密文，
 * 明文不落库）；模型配置字段：base_url、model。
 *
 * 不关心落盘的用例走内存库；所有连接都在 finally 里 await closeDatabase()。
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { closeDatabase, openDatabase } from '../src/server/db/index.js'
import { createSettingsRepo } from '../src/server/db/settingsRepo.js'

const API_KEY = {
  ciphertext: 'Y2lwaGVydGV4dA==',
  iv: 'aXY=',
  tag: 'dGFn',
  hint: 'sk-…1234',
}
const MODEL_CONFIG = { base_url: 'https://api.example.com', model: 'claude-sonnet-5' }

let dir
let seq = 0

after(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

function memoryRepo() {
  const db = openDatabase(':memory:')
  return { db, repo: createSettingsRepo(db) }
}

async function fileRepo() {
  dir ??= await mkdtemp(path.join(tmpdir(), 'llm-todo-settings-'))
  const file = path.join(dir, `db-${++seq}.sqlite`)
  const db = openDatabase(file)
  return { db, repo: createSettingsRepo(db), file }
}

test('未配置时读取返回空', async () => {
  const { db, repo } = memoryRepo()
  try {
    assert.ok(repo.getApiKey() == null)
    assert.ok(repo.getModelConfig() == null)
  } finally {
    await closeDatabase(db)
  }
})

test('保存 API 密钥材料后可以读回', async () => {
  const { db, repo } = memoryRepo()
  try {
    repo.saveApiKey(API_KEY)
    const stored = repo.getApiKey()

    assert.equal(stored.api_key_ciphertext, API_KEY.ciphertext)
    assert.equal(stored.api_key_iv, API_KEY.iv)
    assert.equal(stored.api_key_tag, API_KEY.tag)
    assert.equal(stored.key_hint, API_KEY.hint)
  } finally {
    await closeDatabase(db)
  }
})

test('保存模型配置后可以读回，重新保存会覆盖', async () => {
  const { db, repo } = memoryRepo()
  try {
    repo.saveModelConfig(MODEL_CONFIG)
    assert.equal(repo.getModelConfig().base_url, MODEL_CONFIG.base_url)
    assert.equal(repo.getModelConfig().model, MODEL_CONFIG.model)

    repo.saveModelConfig({ base_url: 'https://other.example.com', model: 'claude-opus-4-8' })
    assert.equal(repo.getModelConfig().base_url, 'https://other.example.com')
    assert.equal(repo.getModelConfig().model, 'claude-opus-4-8')
  } finally {
    await closeDatabase(db)
  }
})

test('清除 API 密钥后读取返回空', async () => {
  const { db, repo } = memoryRepo()
  try {
    repo.saveApiKey(API_KEY)
    repo.clearApiKey()

    assert.ok(repo.getApiKey() == null)
  } finally {
    await closeDatabase(db)
  }
})

test('配置跨连接持久化', async () => {
  const { db, repo, file } = await fileRepo()
  try {
    repo.saveApiKey(API_KEY)
    repo.saveModelConfig(MODEL_CONFIG)
  } finally {
    await closeDatabase(db)
  }

  const reopened = openDatabase(file)
  try {
    const next = createSettingsRepo(reopened)
    assert.equal(next.getApiKey().api_key_ciphertext, API_KEY.ciphertext)
    assert.equal(next.getModelConfig().model, MODEL_CONFIG.model)
  } finally {
    await closeDatabase(reopened)
  }
})
