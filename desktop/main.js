'use strict';
const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const appFile = path.join(__dirname, '工资助手.html');
const appPath = decodeURIComponent(new URL(pathToFileURL(appFile).href).pathname);
const MAX_SAVE = 50 * 1024 * 1024;
const MAX_DATA = 50 * 1024 * 1024;

function dataFile() {
  return path.join(app.getPath('userData'), '工资数据.json');
}

function isAppUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'file:' && decodeURIComponent(url.pathname) === appPath;
  } catch (_) {
    return false;
  }
}

function createWindow(demo) {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#f4f5f4',
    autoHideMenuBar: true,
    title: '衣账 · 四店工资助手',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(appFile, demo ? { query: { demo: '1' } } : undefined);

  // 只允许“打开演示空间”这一个新窗口，其他一律拒绝。
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      if (isAppUrl(url) && target.searchParams.get('demo') === '1') createWindow(true);
    } catch (_) {}
    return { action: 'deny' };
  });

  // 页面不允许跳转离开本程序（例如误点外链）。
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  return win;
}

app.whenReady().then(() => {
  // 本程序不需要摄像头、麦克风、定位等任何权限。
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  createWindow(false);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(false);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('load-data', (event) => {
  const senderUrl = event.senderFrame?.url || event.sender.getURL();
  if (!isAppUrl(senderUrl)) throw new Error('拒绝来自未知页面的读取请求');
  try { return fs.readFileSync(dataFile(), 'utf8'); }
  catch (_) { return null; }
});

ipcMain.handle('save-data', (event, text) => {
  const senderUrl = event.senderFrame?.url || event.sender.getURL();
  if (!isAppUrl(senderUrl)) throw new Error('拒绝来自未知页面的保存请求');
  if (typeof text !== 'string' || text.length > MAX_DATA) throw new Error('数据内容无效或过大');
  if (text === '') { try { fs.unlinkSync(dataFile()); } catch (_) {} return true; }
  fs.writeFileSync(dataFile(), text, 'utf8');
  return true;
});

ipcMain.handle('save-file', async (event, payload) => {
  const senderUrl = event.senderFrame?.url || event.sender.getURL();
  if (!isAppUrl(senderUrl)) throw new Error('拒绝来自未知页面的保存请求');

  const rawName = String((payload && payload.name) || '工资助手文件');
  const name = path.basename(rawName).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 180) || '工资助手文件';
  const data = payload && payload.data;
  if (!data || !data.length) return null;
  if (data.length > MAX_SAVE) throw new Error('文件超过 50MB，未保存');

  const bytes = data instanceof ArrayBuffer
    ? Buffer.from(new Uint8Array(data))
    : ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : null;
  if (!bytes) throw new Error('保存内容格式不正确');

  const win = BrowserWindow.fromWebContents(event.sender);
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  const result = await dialog.showSaveDialog(win || undefined, {
    title: '保存文件',
    defaultPath: path.join(app.getPath('documents'), name),
    filters: extension ? [{ name: extension.toUpperCase() + ' 文件', extensions: [extension] }] : []
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, bytes);
  return result.filePath;
});
