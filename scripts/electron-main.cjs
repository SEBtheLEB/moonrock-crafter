const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');

let serverProcess = null;
let mainWindow = null;
let serverUrl = '';

function getNodeExecutable() {
  return process.env.npm_node_execpath || process.env.NODE || 'node';
}

function startLocalServer() {
  return new Promise((resolve, reject) => {
    const root = path.resolve(__dirname, '..');
    const serverScript = path.join(__dirname, 'dev-server.mjs');
    const nodeExecutable = getNodeExecutable();
    let output = '';
    let resolved = false;

    serverProcess = spawn(nodeExecutable, [serverScript], {
      cwd: root,
      env: {
        ...process.env,
        BROWSER: 'none',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const readyTimer = setTimeout(() => {
      if (resolved) return;
      reject(new Error(`Local server did not start in time.\n\n${output.trim()}`));
    }, 20000);

    const handleOutput = (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
      const match = output.match(/Moonrock Crafter is running at (http:\/\/[^\s]+)/);
      if (!match || resolved) return;
      resolved = true;
      clearTimeout(readyTimer);
      serverUrl = match[1];
      resolve(serverUrl);
    };

    serverProcess.stdout.on('data', handleOutput);
    serverProcess.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });

    serverProcess.on('error', (error) => {
      if (resolved) return;
      clearTimeout(readyTimer);
      reject(error);
    });

    serverProcess.on('exit', (code) => {
      serverProcess = null;
      if (resolved) return;
      clearTimeout(readyTimer);
      reject(new Error(`Local server exited before Electron could load it. Exit code: ${code ?? 'unknown'}`));
    });
  });
}

function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#07111c',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (/^https?:\/\//i.test(targetUrl)) shell.openExternal(targetUrl);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow.loadURL(url);
}

function stopLocalServer() {
  if (!serverProcess) return;
  const processToStop = serverProcess;
  serverProcess = null;
  processToStop.kill();
}

app.whenReady().then(async () => {
  try {
    const url = await startLocalServer();
    await createMainWindow(url);
  } catch (error) {
    dialog.showErrorBox('Moonrock Crafter failed to start', error?.stack || String(error));
    app.quit();
  }
});

app.on('activate', () => {
  if (!mainWindow && serverUrl) createMainWindow(serverUrl).catch((error) => {
    dialog.showErrorBox('Moonrock Crafter failed to reopen', error?.stack || String(error));
  });
});

app.on('before-quit', stopLocalServer);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
