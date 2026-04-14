import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrate } from "./migrate.js";

export interface OpenDbOptions {
  readonly?: boolean;
  runMigrations?: boolean;
}

/**
 * Opens a database connection with proper configuration.
 * This is the canonical entry point for database connections.
 *
 * @param dbPath - Path to the database file, or ':memory:' for in-memory database
 * @param options - Optional configuration
 * @returns Configured Database instance
 */
export function openDb(
  dbPath: string,
  options: OpenDbOptions = {}
): DatabaseSync {
  const { readonly = false, runMigrations = true } = options;

  // Create directory for file-based databases (skip for in-memory)
  if (dbPath !== ':memory:') {
    const dbDir = dirname(dbPath);
    mkdirSync(dbDir, { recursive: true });
  }

  // Create database instance
  const db = new DatabaseSync(dbPath, {
    readOnly: readonly,
  });

  // Enable WAL mode for concurrent CLI + dashboard reads.
  // Skip for in-memory and read-only handles.
  if (dbPath !== ":memory:" && !readonly) {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
  }

  // Run migrations if requested and not in-memory
  if (runMigrations && dbPath !== ':memory:') {
    migrate(db);
  }

  return db;
}

// Re-export DatabaseSync as Database for ergonomic imports across the codebase.
export type Database = DatabaseSync;