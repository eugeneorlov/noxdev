import { DatabaseSync } from "node:sqlite";

export interface OpenDbOptions {
  readonly?: boolean;
  runMigrations?: boolean;
}

export type Database = import("node:sqlite").DatabaseSync;

export function openDb(path: string, options: OpenDbOptions = {}): Database {
  const db = new DatabaseSync(path, {
    readOnly: options.readonly ?? false,
  });

  if (path !== ":memory:" && !options.readonly) {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
  }

  return db;
}