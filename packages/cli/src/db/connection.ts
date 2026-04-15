// Defeat esbuild's node: prefix stripping by hiding the module name from static analysis.
const sqliteModuleName = "node:sqlite";
const sqlite = await import(sqliteModuleName);
const DatabaseSync = sqlite.DatabaseSync as typeof import("node:sqlite").DatabaseSync;

export interface OpenDbOptions {
  readonly?: boolean;
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