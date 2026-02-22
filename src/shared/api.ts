export type EntryType = 'directory' | 'file';

export interface DirectoryEntry {
  name: string;
  path: string;
  type: EntryType;
}

export type InspectPathResult =
  | { kind: 'directory'; path: string }
  | { kind: 'markdown_file'; path: string; parentDir: string }
  | { kind: 'unsupported' };

export interface OpenFolderDialogResult {
  folderPath: string | null;
  recents: string[];
}

export interface LocalmdApi {
  openFolderDialog: () => Promise<OpenFolderDialogResult>;
  getRecentFolders: () => Promise<string[]>;
  inspectPath: (targetPath: string) => Promise<InspectPathResult>;
  consumeLaunchTarget: () => Promise<string | null>;
  onLaunchTarget: (callback: (targetPath: string) => void) => () => void;
  readDirectory: (folderPath: string) => Promise<DirectoryEntry[]>;
  readMarkdownFile: (filePath: string) => Promise<string>;
  writeMarkdownFile: (filePath: string, content: string) => Promise<{ ok: true }>;
  renderMarkdown: (markdown: string) => string;
  icon: (name: string, attrs?: Record<string, string | number>) => string;
  getPathForFile: (file: File) => string;
}

declare global {
  interface Window {
    localmd: LocalmdApi;
  }
}

export {};
