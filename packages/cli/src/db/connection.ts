import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrate } from "./migrate.js";

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
  options: { runMigrations?: boolean } = {}
): Database.Database {
  const { runMigrations = true } = options;

  // Create directory for file-based databases (skip for in-memory)
  if (dbPath !== ':memory:') {
    const dbDir = dirname(dbPath);
    mkdirSync(dbDir, { recursive: true });
  }

  // Create database instance
  const db = new Database(dbPath);

  // Configure database settings
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Run migrations if requested and not in-memory
  if (runMigrations && dbPath !== ':memory:') {
    migrate(db);
  }

  return db;
}