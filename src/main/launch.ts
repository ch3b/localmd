import fsSync from 'node:fs';
import path from 'node:path';
import { isMarkdownPath } from './filesystem';

export function resolveLaunchTargetFromArgv(argv: string[]): string | null {
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith('-')) {
      continue;
    }

    // Ignore dev-launcher args like "." from `electron .`
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
      // Ignore malformed args.
    }
  }

  return null;
}
