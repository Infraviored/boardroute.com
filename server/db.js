// SQLite through Node's built-in driver (node:sqlite, no native module to build).
import { DatabaseSync } from 'node:sqlite';

export function openDb(file) {
    const db = new DatabaseSync(file);
    db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            created INTEGER NOT NULL,
            last_login INTEGER NOT NULL
        );
        -- sign-in links: only the hash of the token is kept, a link works once
        CREATE TABLE IF NOT EXISTS login_tokens (
            hash TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            expires INTEGER NOT NULL,
            nonce_hash TEXT
        );
        CREATE TABLE IF NOT EXISTS sessions (
            hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created INTEGER NOT NULL,
            expires INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS circuits (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            data TEXT NOT NULL,
            size INTEGER NOT NULL,
            created INTEGER NOT NULL,
            updated INTEGER NOT NULL,
            share TEXT UNIQUE
        );
        CREATE INDEX IF NOT EXISTS circuits_user ON circuits(user_id, updated);
    `);
    try {
        db.exec('ALTER TABLE login_tokens ADD COLUMN nonce_hash TEXT');
    } catch {
        // column already exists
    }
    return db;
}
