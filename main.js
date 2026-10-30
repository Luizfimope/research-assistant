require('dotenv').config({path:require('path').join(__dirname,'.env')});
const { app, BrowserWindow, shell } = require('electron');

// Sobe o servidor Express embutido (mesmo processo, sem precisar rodar separado)
if (!app.requestSingleInstanceLock()) { app.quit(); return; }
const server = require('./src/server.js');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Assistente de Pesquisa',
    webPreferences: {
      contextIsolation: true
    }
  });

  // Links externos (ex: artigos) abrem no navegador padrão, não dentro do app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  const PORT = process.env.PORT || 4141;
  const load=()=>win.loadURL('http://127.0.0.1:'+PORT);
  if(server.listening)load();else server.once('listening',load);
  win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('http://127.0.0.1:'+PORT+'/')){event.preventDefault();if(/^https?:\/\//i.test(url))shell.openExternal(url);}});
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
