import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';

export function getDb(): Database.Database {
  const dbPath = path.join(os.homedir(), '.noxdev', 'ledger.db');

  return new Database(dbPath, {
    readonly: true,
    fileMustExist: false
  });
}