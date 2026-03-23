import fs from 'node:fs/promises'
import path from 'node:path'
import { app, safeStorage } from 'electron'

const KEYSTORE_FILENAME = '.keystore'

function ensureEncryptionAvailable() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Safe storage encryption is not available on this device.')
  }
}

function getKeystorePath() {
  return path.join(app.getPath('userData'), KEYSTORE_FILENAME)
}

export async function saveAPIKey(key) {
  const normalizedKey = typeof key === 'string' ? key.trim() : ''

  if (!normalizedKey) {
    throw new Error('An OpenAI API key is required.')
  }

  ensureEncryptionAvailable()

  const keystorePath = getKeystorePath()
  const encryptedKey = safeStorage.encryptString(normalizedKey)

  await fs.mkdir(path.dirname(keystorePath), { recursive: true })
  await fs.writeFile(keystorePath, encryptedKey)
}

export async function loadAPIKey() {
  const keystorePath = getKeystorePath()

  try {
    const encryptedKey = await fs.readFile(keystorePath)

    ensureEncryptionAvailable()

    return safeStorage.decryptString(encryptedKey)
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }

    throw error
  }
}

export async function deleteAPIKey() {
  const keystorePath = getKeystorePath()

  try {
    await fs.unlink(keystorePath)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
}

export async function hasAPIKey() {
  try {
    await fs.access(getKeystorePath())
    return true
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false
    }

    throw error
  }
}
