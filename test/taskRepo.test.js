/**
 * src/server/db/taskRepo.js 契约测试：任务的增删改查。
 *
 * 约定的接口：
 *   createTaskRepo(db) -> { create(input), get(id), list(), update(id, patch), remove(id) }
 * 任务字段：id、title、status ∈ {todo, doing, done}、priority ∈ {low, med, high}、
 * due_at、parent_id、sort_order、created_at、updated_at。
 *
 * 不关心落盘的用例走内存库；所有连接都在 finally 里 await closeDatabase()。
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { closeDatabase, openDatabase } from '../src/server/db/index.js'
import { createTaskRepo } from '../src/server/db/taskRepo.js'

const PRIORITIES = ['low', 'med', 'high']

let dir
let seq = 0

after(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

/** 内存库上的仓库。 */
function memoryRepo() {
  const db = openDatabase(':memory:')
  return { db, repo: createTaskRepo(db) }
}

/** 临时文件库上的仓库，返回 { db, repo, file }。 */
async function fileRepo() {
  dir ??= await mkdtemp(path.join(tmpdir(), 'llm-todo-tasks-'))
  const file = path.join(dir, `db-${++seq}.sqlite`)
  const db = openDatabase(file)
  return { db, repo: createTaskRepo(db), file }
}

test('create 填充默认值', async () => {
  const { db, repo } = memoryRepo()
  try {
    const task = repo.create({ title: '写周报' })

    assert.ok(task.id)
    assert.equal(task.title, '写周报')
    assert.equal(task.status, 'todo')
    assert.ok(PRIORITIES.includes(task.priority), `未知 priority：${task.priority}`)
    assert.ok(task.due_at == null)
    assert.ok(task.parent_id == null)
    assert.ok(task.created_at)
    assert.equal(task.updated_at, task.created_at)
  } finally {
    await closeDatabase(db)
  }
})

test('create 接受 status / priority / due_at / parent_id / sort_order', async () => {
  const { db, repo } = memoryRepo()
  try {
    const parent = repo.create({ title: '父任务' })
    const child = repo.create({
      title: '子任务',
      status: 'doing',
      priority: 'high',
      due_at: '2026-09-30',
      parent_id: parent.id,
      sort_order: 3,
    })

    assert.equal(child.status, 'doing')
    assert.equal(child.priority, 'high')
    assert.equal(child.due_at, '2026-09-30')
    assert.equal(child.parent_id, parent.id)
    assert.equal(child.sort_order, 3)
    assert.deepEqual(repo.get(child.id), child)
  } finally {
    await closeDatabase(db)
  }
})

test('create 拒绝非法的 status / priority', async () => {
  const { db, repo } = memoryRepo()
  try {
    assert.throws(() => repo.create({ title: '任务', status: 'urgent' }))
    assert.throws(() => repo.create({ title: '任务', priority: 'urgent' }))
  } finally {
    await closeDatabase(db)
  }
})

test('update 局部更新并刷新 updated_at', async () => {
  const { db, repo } = memoryRepo()
  try {
    const task = repo.create({ title: '写周报' })
    const updated = repo.update(task.id, { status: 'done' })

    assert.equal(updated.status, 'done')
    assert.equal(updated.title, '写周报')
    assert.equal(updated.id, task.id)
    assert.ok(updated.updated_at >= task.updated_at, 'updated_at 不应当回退')
    assert.deepEqual(repo.get(task.id), updated)
  } finally {
    await closeDatabase(db)
  }
})

test('get 未知 id 返回空，remove 之后任务消失', async () => {
  const { db, repo } = memoryRepo()
  try {
    const task = repo.create({ title: '写周报' })

    assert.ok(repo.get('missing') == null)

    repo.remove(task.id)
    assert.ok(repo.get(task.id) == null)
    assert.deepEqual(
      repo.list().map((row) => row.id),
      [],
    )
  } finally {
    await closeDatabase(db)
  }
})

test('list 返回已创建的任务', async () => {
  const { db, repo } = memoryRepo()
  try {
    const first = repo.create({ title: '第一条' })
    const second = repo.create({ title: '第二条', sort_order: 1 })

    const ids = repo.list().map((row) => row.id)
    assert.equal(ids.length, 2)
    assert.ok(ids.includes(first.id) && ids.includes(second.id))
  } finally {
    await closeDatabase(db)
  }
})

test('任务跨连接持久化', async () => {
  const { db, repo, file } = await fileRepo()
  let task
  try {
    task = repo.create({ title: '写周报', priority: 'high' })
  } finally {
    await closeDatabase(db)
  }

  const reopened = openDatabase(file)
  try {
    assert.deepEqual(createTaskRepo(reopened).get(task.id), task)
  } finally {
    await closeDatabase(reopened)
  }
})
