import fs from 'node:fs/promises';
import path from 'node:path';
import type { DirectoryEntry, InspectPathResult } from '../shared/api';
import { MARKDOWN_EXTENSIONS } from './constants';

export function isMarkdownPath(targetPath: string): boolean {
  return MARKDOWN_EXTENSIONS.has(path.extname(targetPath).toLowerCase());
}

export async function inspectTargetPath(targetPath: string): Promise<InspectPathResult> {
  if (!targetPath || typeof targetPath !== 'string') {
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
  } catch {
    // Fall through.
  }

  return { kind: 'unsupported' };
}

export async function listDirectory(folderPath: string): Promise<DirectoryEntry[]> {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });

  const rows = entries
    .map((entry): DirectoryEntry | null => {
      if (entry.isSymbolicLink()) {
        return null;
      }

      const entryPath = path.join(folderPath, entry.name);
      if (entry.isDirectory()) {
        return { name: entry.name, path: entryPath, type: 'directory' };
      }

      if (entry.isFile() && isMarkdownPath(entry.name)) {
        return { name: entry.name, path: entryPath, type: 'file' };
      }

      return null;
    })
    .filter((entry): entry is DirectoryEntry => entry !== null);

  return rows.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export async function readMarkdownFile(filePath: string): Promise<string> {
  if (!isMarkdownPath(filePath)) {
    throw new Error('Only Markdown files are supported.');
  }

  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error('Path is not a file.');
  }

  return fs.readFile(filePath, 'utf8');
}

export async function writeMarkdownFile(filePath: string, content: string): Promise<{ ok: true }> {
  if (!isMarkdownPath(filePath)) {
    throw new Error('Only Markdown files are supported.');
  }

  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error('Path is not a file.');
  }

  await fs.writeFile(filePath, content, 'utf8');
  return { ok: true };
}
