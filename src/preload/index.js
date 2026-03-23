const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  saveAPIKey: (key) => ipcRenderer.invoke('key:save', key),
  deleteAPIKey: () => ipcRenderer.invoke('key:delete'),
  hasAPIKey: () => ipcRenderer.invoke('key:hasKey'),
  openDocxDialog: () => ipcRenderer.invoke('dialog:openDocx'),
  parseDocx: (filePath) => ipcRenderer.invoke('parse:docx', filePath),
  analyseAssessment: (criteriaDoc, assessmentDoc, mode) =>
    ipcRenderer.invoke('ai:analyse', { criteriaDoc, assessmentDoc, mode }),
  exportPDF: () => ipcRenderer.invoke('report:exportPDF')
})
