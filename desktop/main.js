'use strict';
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

function createWindow(demo) {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#f4f6f2',
    autoHideMenuBar: true,
    title: '衣账 · 四店工资助手',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '工资助手.html'), demo ? { query: { demo: '1' } } : undefined);
  return win;
}

app.whenReady().then(() => {
  createWindow(false);
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => {
      // 页面里唯一的 window.open 是“打开演示空间”。
      createWindow(true);
      return { action: 'deny' };
    });
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(false);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('save-file', async (event, payload) => {
  const name = String(payload && payload.name || '工资助手文件');
  const data = payload && payload.data;
  if (!data || !data.length) return null;
  const win = BrowserWindow.fromWebContents(event.sender);
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
  const result = await dialog.showSaveDialog(win, {
    title: '保存文件',
    defaultPath: path.join(app.getPath('documents'), name),
    filters: extension ? [{ name: extension.toUpperCase() + ' 文件', extensions: [extension] }] : []
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, Buffer.from(data));
  return result.filePath;
});
