'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  saveFile: (name, data) => ipcRenderer.invoke('save-file', { name, data })
});
