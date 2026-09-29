import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Load the monorepo-root `.env` no matter which directory the process was
 * started from. In dev the API runs with its cwd at `apps/api`, so the root
 * `.env` (where DATABASE_URL lives) would otherwise be missed. Imported first
 * in main.ts, before anything reads process.env.
 */
let dir = process.cwd();
for (let i = 0; i < 6; i += 1) {
  const candidate = join(dir, '.env');
  if (existsSync(candidate)) {
    config({ path: candidate });
    break;
  }
  const parent = dirname(dir);
  if (parent === dir) break;
  dir = parent;
}
