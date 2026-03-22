import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { migrate } from "./migrate.js";

const DB_DIR = join(homedir(), ".noxdev");
const DB_PATH = join(DB_DIR, "ledger.db");

let _db: Database.Database | undefined;

export function getDb(): Database.Database {
  if (_db) return _db;

  mkdirSync(DB_DIR, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  migrate(_db);

  return _db;
}
