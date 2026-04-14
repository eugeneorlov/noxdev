import path from 'node:path';
import os from 'node:os';
import { openDb, type Database } from '../../../cli/src/db/connection.js';

export function getDb(): Database {
  const dbPath = path.join(os.homedir(), '.noxdev', 'ledger.db');

  return openDb(dbPath, {
    readonly: false,
    runMigrations: true
  });
}