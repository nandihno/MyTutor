const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  saveAPIKey: (key) => ipcRenderer.invoke('key:save', key),
  deleteAPIKey: () => ipcRenderer.invoke('key:delete'),
  hasAPIKey: () => ipcRenderer.invoke('key:hasKey'),
  openDocxDialog: () => ipcRenderer.invoke('dialog:openDocx'),
  validateFile: (filePath) => ipcRenderer.invoke('file:validate', filePath),
  parseDocx: (filePath) => ipcRenderer.invoke('parse:docx', filePath),
  analyseAssessment: (criteriaDoc, assessmentDoc, mode) =>
    ipcRenderer.invoke('ai:analyse', { criteriaDoc, assessmentDoc, mode }),
  exportPDF: (reportType) => ipcRenderer.invoke('report:exportPDF', { reportType }),
  saveHistory: (result, criteriaFileName, assessmentFileName, mode) =>
    ipcRenderer.invoke('history:save', { result, criteriaFileName, assessmentFileName, mode }),
  listHistory: () => ipcRenderer.invoke('history:list'),
  loadHistory: (id) => ipcRenderer.invoke('history:load', id),
  deleteHistory: (id) => ipcRenderer.invoke('history:delete', id),
  onShortcut: (callback) => {
    const listener = (_event, action) => callback(action)
    ipcRenderer.on('shortcut:trigger', listener)

    return () => {
      ipcRenderer.removeListener('shortcut:trigger', listener)
    }
  }
})
