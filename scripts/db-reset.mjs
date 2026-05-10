// Deletes bookray.db and the books/ directory from the Electron userData path.
// Run during development with: npm run db:reset
// WARNING: This permanently removes all library data and copied EPUB files.

import { rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const appName = 'bookray'; // must match app.getName() — derived from package.json "name"

const base =
  process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support')
    : process.platform === 'win32'
      ? process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
      : join(homedir(), '.config');

const userDataDir = join(base, appName);
const dbPath      = join(userDataDir, 'bookray.db');
const booksDir    = join(userDataDir, 'books');

await rm(dbPath,    { force: true });
await rm(booksDir,  { force: true, recursive: true });

console.log('Reset complete. Deleted:');
console.log(' ', dbPath);
console.log(' ', booksDir);
