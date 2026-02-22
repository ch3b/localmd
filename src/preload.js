const { contextBridge, ipcRenderer, webUtils } = require('electron');
const { marked } = require('marked');
const feather = require('feather-icons');

marked.setOptions({
  gfm: true,
  breaks: false
});

contextBridge.exposeInMainWorld('localmd', {
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  getRecentFolders: () => ipcRenderer.invoke('get-recent-folders'),
  inspectPath: (targetPath) => ipcRenderer.invoke('inspect-path', targetPath),
  consumeLaunchTarget: () => ipcRenderer.invoke('consume-launch-target'),
  onLaunchTarget: (callback) => {
    ipcRenderer.on('launch-target', (_event, targetPath) => callback(targetPath));
  },
  readDirectory: (folderPath) => ipcRenderer.invoke('read-directory', folderPath),
  readMarkdownFile: (filePath) => ipcRenderer.invoke('read-markdown-file', filePath),
  writeMarkdownFile: (filePath, content) => ipcRenderer.invoke('write-markdown-file', filePath, content),
  renderMarkdown: (markdown) => marked.parse(markdown || ''),
  icon: (name, attrs = {}) => {
    const entry = feather.icons[name];
    if (!entry) {
      return '';
    }
    return entry.toSvg(attrs);
  },
  getPathForFile: (file) => webUtils.getPathForFile(file)
});
