import { constants } from 'node:fs'
import { access, readFile, stat } from 'node:fs/promises'

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024
const LARGE_FILE_WARNING_BYTES = 10 * 1024 * 1024
const ZIP_MAGIC_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04])
const DOCX_DOCUMENT_PATH = Buffer.from('word/document.xml')

function formatMegabytes(byteCount) {
  return (byteCount / (1024 * 1024)).toFixed(1)
}

export async function validateDocxFile(filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    return {
      valid: false,
      error: 'Choose a valid .docx file before continuing.'
    }
  }

  try {
    await access(filePath, constants.R_OK)
  } catch {
    return {
      valid: false,
      error: 'This file does not exist or cannot be read.'
    }
  }

  const fileStats = await stat(filePath)

  if (!fileStats.isFile()) {
    return {
      valid: false,
      error: 'This selection is not a file.'
    }
  }

  if (fileStats.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: 'This file is larger than 50MB. Please choose a smaller .docx file.'
    }
  }

  const fileBuffer = await readFile(filePath)

  if (fileBuffer.length < ZIP_MAGIC_BYTES.length || !fileBuffer.subarray(0, 4).equals(ZIP_MAGIC_BYTES)) {
    return {
      valid: false,
      error: 'This file is not a valid .docx document.'
    }
  }

  if (!fileBuffer.includes(DOCX_DOCUMENT_PATH)) {
    return {
      valid: false,
      error: 'This file is missing the Word document content and cannot be analysed.'
    }
  }

  if (fileStats.size >= LARGE_FILE_WARNING_BYTES) {
    return {
      valid: true,
      warning: `Large file detected (${formatMegabytes(fileStats.size)}MB). Analysis may take longer.`
    }
  }

  return { valid: true }
}
