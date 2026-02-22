import fs from 'node:fs/promises';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron';
import { addRecentFolder, loadRecentFolders, saveRecentFolders } from './recents';
import { inspectTargetPath, listDirectory, readMarkdownFile, writeMarkdownFile } from './filesystem';
import { resolveLaunchTargetFromArgv } from './launch';

let mainWindow: BrowserWindow | null = null;
let hasRendererLoaded = false;
let launchTargetPath: string | null = null;

function dispatchLaunchTarget(targetPath: string): boolean {
  if (!mainWindow || mainWindow.isDestroyed() || !hasRendererLoaded) {
    return false;
  }

  const wc = mainWindow.webContents;
  if (!wc || wc.isDestroyed()) {
    return false;
  }

  try {
    wc.send('launch-target', targetPath);
    return true;
  } catch {
    return false;
  }
}

function queueLaunchTarget(targetPath: string | null): void {
  if (!targetPath) {
    return;
  }

  if (!dispatchLaunchTarget(targetPath)) {
    launchTargetPath = targetPath;
  }
}

function createWindow(): void {
  hasRendererLoaded = false;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 620,
    title: 'localmd',
    backgroundColor: '#f6f8f5',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
    hasRendererLoaded = false;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    hasRendererLoaded = true;
    if (launchTargetPath) {
      dispatchLaunchTarget(launchTargetPath);
      launchTargetPath = null;
    }
  });
}

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

function registerIpcHandlers(): void {
  ipcMain.handle('open-folder-dialog', async () => {
    const options: OpenDialogOptions = {
      title: 'Open Folder',
      properties: ['openDirectory', 'createDirectory']
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return { folderPath: null, recents: await loadRecentFolders() };
    }

    const folderPath = result.filePaths[0]!;
    const recents = await addRecentFolder(folderPath);
    return { folderPath, recents };
  });

  ipcMain.handle('get-recent-folders', async () => {
    const recents = await loadRecentFolders();
    await saveRecentFolders(recents);
    return recents;
  });

  ipcMain.handle('inspect-path', async (_event, targetPath: unknown) => {
    if (typeof targetPath !== 'string') {
      return { kind: 'unsupported' } as const;
    }
    return inspectTargetPath(targetPath);
  });

  ipcMain.handle('consume-launch-target', () => {
    const target = launchTargetPath;
    launchTargetPath = null;
    return target;
  });

  ipcMain.handle('read-directory', async (_event, folderPath: unknown) => {
    if (typeof folderPath !== 'string') {
      throw new Error('Invalid folder path.');
    }

    const stat = await fs.stat(folderPath);
    if (!stat.isDirectory()) {
      throw new Error('Path is not a directory.');
    }

    return listDirectory(folderPath);
  });

  ipcMain.handle('read-markdown-file', async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string') {
      throw new Error('Invalid file path.');
    }

    return readMarkdownFile(filePath);
  });

  ipcMain.handle('write-markdown-file', async (_event, filePath: unknown, content: unknown) => {
    if (typeof filePath !== 'string') {
      throw new Error('Invalid file path.');
    }

    if (typeof content !== 'string') {
      throw new Error('Invalid file content.');
    }

    return writeMarkdownFile(filePath, content);
  });
}

function registerAppLifecycle(): void {
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('second-instance', (_event, argv) => {
    const incomingPath = resolveLaunchTargetFromArgv(argv);
    if (incomingPath) {
      queueLaunchTarget(incomingPath);
    }

    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
    focusMainWindow();
  });

  app.on('open-file', (event, openPath) => {
    event.preventDefault();
    queueLaunchTarget(openPath);

    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
    focusMainWindow();
  });
}

async function bootstrap(): Promise<void> {
  const singleInstanceLock = app.requestSingleInstanceLock();
  if (!singleInstanceLock) {
    app.quit();
    return;
  }

  registerAppLifecycle();
  registerIpcHandlers();

  const startupTarget = resolveLaunchTargetFromArgv(process.argv);
  if (startupTarget) {
    launchTargetPath = startupTarget;
  }

  await app.whenReady();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

void bootstrap();
