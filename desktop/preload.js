'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  saveFile: (name, data) => ipcRenderer.invoke('save-file', { name, data }),
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (text) => ipcRenderer.invoke('save-data', text),
  aiChat: (payload) => ipcRenderer.invoke('ai-chat', payload)
});
