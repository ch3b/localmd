import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import { RECENTS_FILE } from './constants';

function recentsFilePath(): string {
  return path.join(app.getPath('userData'), RECENTS_FILE);
}

export async function loadRecentFolders(): Promise<string[]> {
  try {
    const data = await fs.readFile(recentsFilePath(), 'utf8');
    const parsed = JSON.parse(data) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const existing: string[] = [];
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

export async function saveRecentFolders(folders: string[]): Promise<void> {
  const unique = [...new Set(folders)].slice(0, 12);
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(recentsFilePath(), JSON.stringify(unique, null, 2), 'utf8');
}

export async function addRecentFolder(folderPath: string): Promise<string[]> {
  const recents = await loadRecentFolders();
  const next = [folderPath, ...recents.filter((entry) => entry !== folderPath)].slice(0, 12);
  await saveRecentFolders(next);
  return next;
}
