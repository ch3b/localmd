const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');

const RECENTS_FILE = 'recent-folders.json';
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.mkd']);

let mainWindow;
let hasRendererLoaded = false;
let launchTargetPath = null;

function isMarkdownPath(filePath) {
  return MARKDOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function resolveLaunchTargetFromArgv(argv) {
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith('-')) {
      continue;
    }

    // Ignore dev launcher args like "." from `electron .`
    if (!path.isAbsolute(arg)) {
      continue;
    }

    try {
      const resolved = path.resolve(arg);
      if (!fsSync.existsSync(resolved)) {
        continue;
      }

      const stat = fsSync.statSync(resolved);
      if (stat.isDirectory()) {
        return resolved;
      }

      if (stat.isFile() && isMarkdownPath(resolved)) {
        return resolved;
      }
    } catch {
      // Ignore non-path args.
    }
  }

  return null;
}

function dispatchLaunchTarget(targetPath) {
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

function queueLaunchTarget(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') {
    return;
  }

  if (dispatchLaunchTarget(targetPath)) {
    return;
  }

  launchTargetPath = targetPath;
}

function createWindow() {
  hasRendererLoaded = false;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 620,
    title: 'localmd',
    backgroundColor: '#f6f8f5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
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

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

function recentsFilePath() {
  return path.join(app.getPath('userData'), RECENTS_FILE);
}

async function loadRecentFolders() {
  try {
    const data = await fs.readFile(recentsFilePath(), 'utf8');
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const existing = [];
    for (const folderPath of parsed) {
      if (typeof folderPath !== 'string') {
        continue;
      }
      try {
        const stat = await fs.stat(folderPath);
        if (stat.isDirectory()) {
          existing.push(folderPath);
        }
      } catch {
        // Skip missing folders.
      }
    }
    return existing.slice(0, 12);
  } catch {
    return [];
  }
}

async function saveRecentFolders(folders) {
  const unique = [...new Set(folders)].slice(0, 12);
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(recentsFilePath(), JSON.stringify(unique, null, 2), 'utf8');
}

async function addRecentFolder(folderPath) {
  const recents = await loadRecentFolders();
  const next = [folderPath, ...recents.filter((entry) => entry !== folderPath)].slice(0, 12);
  await saveRecentFolders(next);
  return next;
}

async function listDirectory(folderPath) {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });

  const rows = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(folderPath, entry.name);
      if (entry.isSymbolicLink()) {
        return null;
      }

      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path: entryPath,
          type: 'directory'
        };
      }

      if (entry.isFile() && isMarkdownPath(entry.name)) {
        return {
          name: entry.name,
          path: entryPath,
          type: 'file'
        };
      }

      return null;
    })
  );

  return rows
    .filter(Boolean)
    .sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
}

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
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
    focusMainWindow();
  });

  const startupTarget = resolveLaunchTargetFromArgv(process.argv);
  if (startupTarget) {
    launchTargetPath = startupTarget;
  }

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('open-folder-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Folder',
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { folderPath: null, recents: await loadRecentFolders() };
  }

  const folderPath = result.filePaths[0];
  const recents = await addRecentFolder(folderPath);
  return { folderPath, recents };
});

ipcMain.handle('get-recent-folders', async () => {
  const recents = await loadRecentFolders();
  await saveRecentFolders(recents);
  return recents;
});

ipcMain.handle('inspect-path', async (_event, targetPath) => {
  if (typeof targetPath !== 'string') {
    return { kind: 'unsupported' };
  }

  try {
    const stat = await fs.stat(targetPath);
    if (stat.isDirectory()) {
      return { kind: 'directory', path: targetPath };
    }

    if (stat.isFile() && isMarkdownPath(targetPath)) {
      return {
        kind: 'markdown_file',
        path: targetPath,
        parentDir: path.dirname(targetPath)
      };
    }

    return { kind: 'unsupported' };
  } catch {
    return { kind: 'unsupported' };
  }
});

ipcMain.handle('consume-launch-target', () => {
  const target = launchTargetPath;
  launchTargetPath = null;
  return target;
});

ipcMain.handle('read-directory', async (_event, folderPath) => {
  if (typeof folderPath !== 'string') {
    throw new Error('Invalid folder path.');
  }

  const stat = await fs.stat(folderPath);
  if (!stat.isDirectory()) {
    throw new Error('Path is not a directory.');
  }

  return listDirectory(folderPath);
});

ipcMain.handle('read-markdown-file', async (_event, filePath) => {
  if (typeof filePath !== 'string') {
    throw new Error('Invalid file path.');
  }

  if (!isMarkdownPath(filePath)) {
    throw new Error('Only Markdown files are supported.');
  }

  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error('Path is not a file.');
  }

  return fs.readFile(filePath, 'utf8');
});

ipcMain.handle('write-markdown-file', async (_event, filePath, content) => {
  if (typeof filePath !== 'string') {
    throw new Error('Invalid file path.');
  }

  if (typeof content !== 'string') {
    throw new Error('Invalid file content.');
  }

  if (!isMarkdownPath(filePath)) {
    throw new Error('Only Markdown files are supported.');
  }

  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error('Path is not a file.');
  }

  await fs.writeFile(filePath, content, 'utf8');
  return { ok: true };
});
