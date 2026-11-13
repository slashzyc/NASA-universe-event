import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';

/** The SQLite file is the source of truth, including immutable analysis evidence. */
export function openStore(dataDir){
  mkdirSync(dataDir,{recursive:true});
  const db=new DatabaseSync(path.join(dataDir,'lunamargin.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT OR IGNORE INTO schema_version VALUES(1,datetime('now'));
    CREATE TABLE IF NOT EXISTS visitors(token_hash TEXT PRIMARY KEY,created_at TEXT NOT NULL,last_seen_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS regions(id TEXT PRIMARY KEY,metadata_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS datasets(id TEXT PRIMARY KEY,sha256 TEXT NOT NULL,metadata_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS releases(build_id TEXT PRIMARY KEY,algorithm_sha256 TEXT NOT NULL,manifest_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS analyses(id TEXT PRIMARY KEY,owner_hash TEXT NOT NULL REFERENCES visitors(token_hash),status TEXT NOT NULL,created_at TEXT NOT NULL,completed_at TEXT,parameters_json TEXT NOT NULL,record_json TEXT,record_sha256 TEXT,error_json TEXT);
    CREATE INDEX IF NOT EXISTS analyses_owner ON analyses(owner_hash,created_at);
    CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,owner_hash TEXT NOT NULL REFERENCES visitors(token_hash),analysis_id TEXT NOT NULL REFERENCES analyses(id),name TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS tasks_owner ON tasks(owner_hash,created_at);
    CREATE TABLE IF NOT EXISTS shares(token_hash TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS data_jobs(id TEXT PRIMARY KEY,owner_hash TEXT REFERENCES visitors(token_hash),status TEXT NOT NULL,metadata_json TEXT NOT NULL,updated_at TEXT NOT NULL);
  `);
  return db;
}
