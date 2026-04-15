import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { openDb, type Database } from "./connection.js";
import { migrate } from "./migrate.js";

const DB_DIR = join(homedir(), ".noxdev");
const DB_PATH = join(DB_DIR, "ledger.db");

let _db: Database | undefined;

export function getDb(): Database {
  if (_db) return _db;

  mkdirSync(DB_DIR, { recursive: true });
  _db = openDb(DB_PATH);
  migrate(_db);

  return _db;
}