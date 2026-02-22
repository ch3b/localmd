import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { marked } from 'marked';
import feather from 'feather-icons';
import type { LocalmdApi } from '../shared/api';

marked.setOptions({
  gfm: true,
  breaks: false
});

const api: LocalmdApi = {
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  getRecentFolders: () => ipcRenderer.invoke('get-recent-folders'),
  inspectPath: (targetPath) => ipcRenderer.invoke('inspect-path', targetPath),
  consumeLaunchTarget: () => ipcRenderer.invoke('consume-launch-target'),
  onLaunchTarget: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, targetPath: string) => callback(targetPath);
    ipcRenderer.on('launch-target', listener);
    return () => ipcRenderer.removeListener('launch-target', listener);
  },
  readDirectory: (folderPath) => ipcRenderer.invoke('read-directory', folderPath),
  readMarkdownFile: (filePath) => ipcRenderer.invoke('read-markdown-file', filePath),
  writeMarkdownFile: (filePath, content) => ipcRenderer.invoke('write-markdown-file', filePath, content),
  renderMarkdown: (markdown) => marked.parse(markdown || '') as string,
  icon: (name, attrs = {}) => {
    const entry = feather.icons[name];
    return entry ? entry.toSvg(attrs) : '';
  },
  getPathForFile: (file) => webUtils.getPathForFile(file)
};

contextBridge.exposeInMainWorld('localmd', api);
