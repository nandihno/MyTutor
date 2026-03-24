import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { app } from 'electron'

function getHistoryDirectory() {
  return path.join(app.getPath('userData'), 'history')
}

function getHistoryIndexPath() {
  return path.join(getHistoryDirectory(), 'index.json')
}

function getHistoryResultPath(id) {
  return path.join(getHistoryDirectory(), `${id}.json`)
}

async function ensureHistoryDirectory() {
  await mkdir(getHistoryDirectory(), { recursive: true })
}

async function readJsonFile(filePath, fallbackValue) {
  try {
    const fileContents = await readFile(filePath, 'utf8')
    return JSON.parse(fileContents)
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallbackValue
    }

    throw error
  }
}

async function writeJsonFile(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8')
}

async function readHistoryIndex() {
  await ensureHistoryDirectory()
  const indexData = await readJsonFile(getHistoryIndexPath(), [])

  return Array.isArray(indexData) ? indexData : []
}

function sortHistoryNewestFirst(items) {
  return [...items].sort(
    (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()
  )
}

export async function saveResult(result, criteriaFileName, assessmentFileName, mode) {
  await ensureHistoryDirectory()

  const id = randomUUID()
  const metadataEntry = {
    id,
    date: new Date().toISOString(),
    mode,
    criteriaFileName,
    assessmentFileName
  }

  await writeJsonFile(getHistoryResultPath(id), result)

  const indexItems = await readHistoryIndex()
  await writeJsonFile(getHistoryIndexPath(), sortHistoryNewestFirst([metadataEntry, ...indexItems]))

  return id
}

export async function loadResult(id) {
  if (!id) {
    throw new Error('A history id is required.')
  }

  const result = await readJsonFile(getHistoryResultPath(id), null)

  if (!result) {
    throw new Error('History entry not found.')
  }

  return result
}

export async function listHistory() {
  const indexItems = await readHistoryIndex()
  return sortHistoryNewestFirst(indexItems)
}

export async function deleteResult(id) {
  if (!id) {
    throw new Error('A history id is required.')
  }

  await ensureHistoryDirectory()
  const indexItems = await readHistoryIndex()
  const nextIndexItems = indexItems.filter((entry) => entry.id !== id)

  await rm(getHistoryResultPath(id), { force: true })
  await writeJsonFile(getHistoryIndexPath(), sortHistoryNewestFirst(nextIndexItems))
}
