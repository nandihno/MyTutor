import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { analyseAssessment } from './aiService.js'
import { saveAPIKey, loadAPIKey, deleteAPIKey, hasAPIKey } from './keystore.js'
import { parseDocx } from './parser.js'

app.setName('MyTutor')
let mainWindow = null

function registerIPCHandlers() {
  ipcMain.handle('key:save', async (_event, key) => {
    await saveAPIKey(key)
    return { success: true }
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

  ipcMain.handle('parse:docx', async (_event, filePath) => {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      return {
        markdown: '',
        images: [],
        error: 'A valid .docx file path is required.'
      }
    }

    try {
      const { markdown, images } = await parseDocx(filePath)
      return { markdown, images }
    } catch (error) {
      return {
        markdown: '',
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

  ipcMain.handle('report:exportPDF', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow

    if (!browserWindow) {
      return { success: false, error: 'NO_WINDOW' }
    }

    try {
      const saveResult = await dialog.showSaveDialog(browserWindow, {
        title: 'Export teacher report as PDF',
        defaultPath: path.join(app.getPath('documents'), 'MyTutor-Teacher-Report.pdf'),
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
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

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
