import { openDb, type Database } from "./connection.js";
import { join } from "node:path";
import { homedir } from "node:os";

const DB_DIR = join(homedir(), ".noxdev");
const DB_PATH = join(DB_DIR, "ledger.db");

let _db: Database | undefined;

export function getDb(): Database {
  if (_db) return _db;

  _db = openDb(DB_PATH);

  return _db;
}
