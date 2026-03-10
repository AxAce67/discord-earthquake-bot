import { mkdir } from "node:fs/promises";
import path from "node:path";
import sqlite3 from "sqlite3";
import { open, type Database } from "sqlite";

export type SqliteDatabase = Database<sqlite3.Database, sqlite3.Statement>;

export async function createDatabase(databaseUrl: string): Promise<SqliteDatabase> {
  const resolvedPath = databaseUrl === ":memory:" ? ":memory:" : path.resolve(databaseUrl);
  if (resolvedPath !== ":memory:") {
    await mkdir(path.dirname(resolvedPath), { recursive: true });
  }

  const db = await open({
    filename: resolvedPath,
    driver: sqlite3.Database
  });

  await db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS guild_quake_settings (
      guild_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL,
      channel_id TEXT,
      threshold_intensity INTEGER NOT NULL DEFAULT 0,
      image_mode TEXT NOT NULL DEFAULT 'yahoo_best_effort',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quake_events (
      id TEXT PRIMARY KEY,
      canonical_event_id TEXT,
      temporary_event_key TEXT NOT NULL,
      source_first TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      hypocenter_name TEXT,
      latitude REAL,
      longitude REAL,
      depth_km REAL,
      magnitude REAL,
      max_intensity INTEGER,
      tsunami_status TEXT,
      issue_type TEXT,
      status TEXT NOT NULL,
      raw_fast_payload TEXT NOT NULL,
      raw_authoritative_payload TEXT,
      sources_seen TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_quake_events_occurred_at ON quake_events (occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quake_events_temporary_event_key ON quake_events (temporary_event_key);
    CREATE INDEX IF NOT EXISTS idx_quake_events_canonical_event_id ON quake_events (canonical_event_id);

    CREATE TABLE IF NOT EXISTS quake_notifications (
      event_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      last_render_hash TEXT NOT NULL,
      image_url TEXT,
      source_url TEXT,
      image_status TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (event_id, guild_id)
    );

    CREATE TABLE IF NOT EXISTS source_cursor (
      source_name TEXT PRIMARY KEY,
      cursor TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const notificationColumns = await db.all<{ name: string }[]>(`PRAGMA table_info(quake_notifications)`);
  if (!notificationColumns.some((column) => column.name === "source_url")) {
    await db.exec(`ALTER TABLE quake_notifications ADD COLUMN source_url TEXT`);
  }

  return db;
}
