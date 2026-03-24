import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { analyseAssessment } from './aiService.js'
import { validateDocxFile } from './fileValidation.js'
import {
  deleteResult,
  listHistory,
  loadResult,
  saveResult
} from './historyStore.js'
import { saveAPIKey, loadAPIKey, deleteAPIKey, hasAPIKey } from './keystore.js'
import { validateOpenAIAPIKey } from './openaiKeyValidation.js'
import { parseDocx } from './parser.js'
import { loadWindowState, saveWindowState } from './windowState.js'

app.setName('MyTutor')
let mainWindow = null

function registerIPCHandlers() {
  ipcMain.handle('key:save', async (_event, key) => {
    const validationResult = await validateOpenAIAPIKey(key)

    if (!validationResult.valid) {
      return {
        success: false,
        error: validationResult.error
      }
    }

    await saveAPIKey(key)
    return { success: true, verified: true }
  })

  ipcMain.handle('key:load', async () => {
    const key = await loadAPIKey()
    return { key }
  })

  ipcMain.handle('key:delete', async () => {
    await deleteAPIKey()
    return { success: true }
  })

  ipcMain.handle('key:hasKey', async () => {
    const exists = await hasAPIKey()
    return { exists }
  })

  ipcMain.handle('dialog:openDocx', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    const options = {
      filters: [{ name: 'Word Documents', extensions: ['docx'] }],
      properties: ['openFile']
    }

    const result = browserWindow
      ? await dialog.showOpenDialog(browserWindow, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return { cancelled: true }
    }

    const filePath = result.filePaths[0]

    return {
      filePath,
      fileName: path.basename(filePath)
    }
  })

  ipcMain.handle('file:validate', async (_event, filePath) => {
    try {
      return await validateDocxFile(filePath)
    } catch (error) {
      return {
        valid: false,
        error: error.message
      }
    }
  })

  ipcMain.handle('parse:docx', async (_event, filePath) => {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      return {
        markdown: '',
        blocks: [],
        images: [],
        error: 'A valid .docx file path is required.'
      }
    }

    try {
      const { markdown, blocks, images } = await parseDocx(filePath)
      return { markdown, blocks, images }
    } catch (error) {
      return {
        markdown: '',
        blocks: [],
        images: [],
        error: error.message
      }
    }
  })

  ipcMain.handle('ai:analyse', async (_event, payload) => {
    try {
      const result = await analyseAssessment(
        payload?.criteriaDoc,
        payload?.assessmentDoc,
        payload?.mode
      )

      return { result }
    } catch (error) {
      return { error: error.code || 'UNKNOWN_ERROR' }
    }
  })

  ipcMain.handle('report:exportPDF', async (event, payload) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow

    if (!browserWindow) {
      return { success: false, error: 'NO_WINDOW' }
    }

    try {
      const reportType = payload?.reportType === 'wordCount' ? 'wordCount' : 'teacher'
      const reportTitle = reportType === 'wordCount' ? 'word count report' : 'teacher report'
      const defaultFileName = reportType === 'wordCount'
        ? 'MyTutor-Word-Count-Report.pdf'
        : 'MyTutor-Teacher-Report.pdf'

      const saveResult = await dialog.showSaveDialog(browserWindow, {
        title: `Export ${reportTitle} as PDF`,
        defaultPath: path.join(app.getPath('documents'), defaultFileName),
        filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
      })

      if (saveResult.canceled || !saveResult.filePath) {
        return { cancelled: true }
      }

      const pdfData = await browserWindow.webContents.printToPDF({
        printBackground: true
      })

      await writeFile(saveResult.filePath, pdfData)

      return {
        success: true,
        path: saveResult.filePath
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  })

  ipcMain.handle('history:save', async (_event, payload) => {
    try {
      const id = await saveResult(
        payload?.result,
        payload?.criteriaFileName,
        payload?.assessmentFileName,
        payload?.mode
      )

      return { id }
    } catch (error) {
      return { error: error.message }
    }
  })

  ipcMain.handle('history:list', async () => {
    try {
      const items = await listHistory()
      return { items }
    } catch (error) {
      return { items: [], error: error.message }
    }
  })

  ipcMain.handle('history:load', async (_event, id) => {
    try {
      const result = await loadResult(id)
      return { result }
    } catch (error) {
      return { error: error.message }
    }
  })

  ipcMain.handle('history:delete', async (_event, id) => {
    try {
      await deleteResult(id)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}

function registerWindowShortcuts(browserWindow) {
  browserWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.alt || !(input.meta || input.control)) {
      return
    }

    let action = ''

    if (input.key === ',') {
      action = 'open-settings'
    } else if (input.key.toLowerCase() === 'n') {
      action = 'new-analysis'
    } else if (input.key.toLowerCase() === 'h') {
      action = 'toggle-history'
    }

    if (!action) {
      return
    }

    event.preventDefault()
    browserWindow.webContents.send('shortcut:trigger', action)
  })
}

async function createWindow() {
  const windowState = await loadWindowState()

  mainWindow = new BrowserWindow({
    ...windowState,
    width: windowState.width ?? 1200,
    height: windowState.height ?? 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

  registerWindowShortcuts(mainWindow)

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('close', () => {
    void saveWindowState(mainWindow)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  registerIPCHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
