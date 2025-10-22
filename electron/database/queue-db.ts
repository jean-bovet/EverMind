/**
 * Queue Database Module
 * Manages SQLite database for file processing queue
 */

import Database from 'better-sqlite3';

// Inline SQL schema (avoids file loading issues in bundled electron app)
const schemaSQL = `-- Queue database schema for Evernote AI Importer
-- Stores file processing queue and metadata

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT UNIQUE NOT NULL,
  title TEXT,
  description TEXT,
  tags TEXT,  -- JSON array stored as string
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, extracting, analyzing, ready-to-upload, uploading, rate-limited, retrying, complete, error
  progress INTEGER DEFAULT 0,  -- 0-100
  error_message TEXT,
  created_at TEXT NOT NULL,
  last_attempt_at TEXT,
  retry_after INTEGER,  -- Unix timestamp in milliseconds
  uploaded_at TEXT,
  note_url TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_status ON files(status);
CREATE INDEX IF NOT EXISTS idx_file_path ON files(file_path);
CREATE INDEX IF NOT EXISTS idx_retry_after ON files(retry_after);
`;

export type FileStatus =
  | 'pending'
  | 'extracting'
  | 'analyzing'
  | 'ready-to-upload'
  | 'uploading'
  | 'rate-limited'
  | 'retrying'
  | 'complete'
  | 'error';

export interface FileRecord {
  id: number;
  file_path: string;
  title: string | null;
  description: string | null;
  tags: string | null;  // JSON array as string
  status: FileStatus;
  progress: number;
  error_message: string | null;
  created_at: string;
  last_attempt_at: string | null;
  retry_after: number | null;
  uploaded_at: string | null;
  note_url: string | null;
}

export interface FileData {
  filePath: string;
  title?: string;
  description?: string;
  tags?: string[];
  status?: FileStatus;
  progress?: number;
  errorMessage?: string;
  noteUrl?: string;
}

let db: Database.Database | null = null;

/**
 * Initialize the database
 * @param dbPath - Path to the database file (or ':memory:' for in-memory)
 * @param force - Force reinitialize even if already initialized (for testing)
 */
export function initDatabase(dbPath: string, force: boolean = false): Database.Database {
  if (db && !force) {
    return db;
  }

  // Close existing connection if forcing reinit
  if (db && force) {
    db.close();
  }

  db = new Database(dbPath);

  // Execute schema (imported as raw string at build time)
  db.exec(schemaSQL);

  console.log(`Database initialized at: ${dbPath}`);
  return db;
}

/**
 * Get the database instance
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Add a new file to the queue
 * @param filePath - Path to the file
 * @returns true if added, false if already exists
 */
export function addFile(filePath: string): boolean {
  const database = getDatabase();

  try {
    const stmt = database.prepare(`
      INSERT INTO files (file_path, status, progress, created_at)
      VALUES (?, 'pending', 0, ?)
    `);

    stmt.run(filePath, new Date().toISOString());
    return true;
  } catch (error) {
    // Unique constraint violation - file already exists
    if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
      return false;
    }
    throw error;
  }
}

/**
 * Update file status and progress
 */
export function updateFileStatus(
  filePath: string,
  status: FileStatus,
  progress: number,
  message?: string
): void {
  const database = getDatabase();

  const stmt = database.prepare(`
    UPDATE files
    SET status = ?,
        progress = ?,
        error_message = ?
    WHERE file_path = ?
  `);

  stmt.run(status, progress, message || null, filePath);
}

/**
 * Update file with AI analysis results
 */
export function updateFileAnalysis(
  filePath: string,
  title: string,
  description: string,
  tags: string[]
): void {
  const database = getDatabase();

  const stmt = database.prepare(`
    UPDATE files
    SET title = ?,
        description = ?,
        tags = ?
    WHERE file_path = ?
  `);

  stmt.run(title, description, JSON.stringify(tags), filePath);
}

/**
 * Mark file as uploaded with note URL
 */
export function updateFileUpload(filePath: string, noteUrl: string): void {
  const database = getDatabase();

  const stmt = database.prepare(`
    UPDATE files
    SET status = 'complete',
        progress = 100,
        uploaded_at = ?,
        note_url = ?,
        retry_after = NULL
    WHERE file_path = ?
  `);

  stmt.run(new Date().toISOString(), noteUrl, filePath);
}

/**
 * Mark file as error
 */
export function updateFileError(filePath: string, errorMessage: string): void {
  const database = getDatabase();

  const stmt = database.prepare(`
    UPDATE files
    SET status = 'error',
        progress = 0,
        error_message = ?
    WHERE file_path = ?
  `);

  stmt.run(errorMessage, filePath);
}

/**
 * Update retry information after rate limit
 */
export function updateRetryInfo(filePath: string, retryAfterMs: number): void {
  const database = getDatabase();

  const stmt = database.prepare(`
    UPDATE files
    SET last_attempt_at = ?,
        retry_after = ?
    WHERE file_path = ?
  `);

  stmt.run(new Date().toISOString(), retryAfterMs, filePath);
}

/**
 * Get a single file record
 */
export function getFile(filePath: string): FileRecord | null {
  const database = getDatabase();

  const stmt = database.prepare(`
    SELECT * FROM files WHERE file_path = ?
  `);

  return stmt.get(filePath) as FileRecord | null;
}

/**
 * Check if a file has already been processed (exists in DB)
 * Replaces the old hasExistingJSON() function
 */
export function isAlreadyProcessed(filePath: string): boolean {
  const file = getFile(filePath);
  // File is "processed" if it has analysis data (title not null) or is in a final state
  return file != null && (
    file.title != null ||  // Has been analyzed
    file.status === 'complete' ||  // Successfully uploaded
    file.status === 'ready-to-upload'  // Analysis done, ready for upload
  );
}

/**
 * Get all files with status 'ready-to-upload' that are ready for upload
 */
export function getReadyToUploadFiles(): FileRecord[] {
  const database = getDatabase();

  const stmt = database.prepare(`
    SELECT * FROM files
    WHERE status = 'ready-to-upload'
    ORDER BY created_at ASC
  `);

  return stmt.all() as FileRecord[];
}

/**
 * Get files that are ready to retry (past their retry_after time)
 */
export function getFilesReadyToRetry(): FileRecord[] {
  const database = getDatabase();
  const now = Date.now();

  const stmt = database.prepare(`
    SELECT * FROM files
    WHERE status IN ('rate-limited', 'retrying')
      AND (retry_after IS NULL OR retry_after <= ?)
    ORDER BY created_at ASC
  `);

  return stmt.all(now) as FileRecord[];
}

/**
 * Check if enough time has passed to retry a file
 */
export function shouldRetry(filePath: string): boolean {
  const file = getFile(filePath);

  if (!file) return false;
  if (!file.retry_after) return true;

  return Date.now() >= file.retry_after;
}

/**
 * Get pending files (for display in UI)
 */
export function getPendingFiles(): FileRecord[] {
  const database = getDatabase();

  const stmt = database.prepare(`
    SELECT * FROM files
    WHERE status = 'pending'
    ORDER BY created_at ASC
  `);

  return stmt.all() as FileRecord[];
}

/**
 * Get all files (for display in UI)
 */
export function getAllFiles(): FileRecord[] {
  const database = getDatabase();

  const stmt = database.prepare(`
    SELECT * FROM files
    ORDER BY created_at DESC, id DESC
  `);

  return stmt.all() as FileRecord[];
}

/**
 * Get queue statistics
 */
export function getStats(): {
  total: number;
  pending: number;
  processing: number;
  readyToUpload: number;
  uploading: number;
  complete: number;
  error: number;
} {
  const database = getDatabase();

  const stmt = database.prepare(`
    SELECT
      COUNT(*) as total,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending,
      COALESCE(SUM(CASE WHEN status IN ('extracting', 'analyzing') THEN 1 ELSE 0 END), 0) as processing,
      COALESCE(SUM(CASE WHEN status = 'ready-to-upload' THEN 1 ELSE 0 END), 0) as readyToUpload,
      COALESCE(SUM(CASE WHEN status IN ('uploading', 'rate-limited', 'retrying') THEN 1 ELSE 0 END), 0) as uploading,
      COALESCE(SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END), 0) as complete,
      COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) as error
    FROM files
  `);

  return stmt.get() as any;
}

/**
 * Delete a file from the queue
 */
export function deleteFile(filePath: string): void {
  const database = getDatabase();

  const stmt = database.prepare(`
    DELETE FROM files WHERE file_path = ?
  `);

  stmt.run(filePath);
}

/**
 * Delete all completed files
 */
export function deleteCompletedFiles(): number {
  const database = getDatabase();

  const stmt = database.prepare(`
    DELETE FROM files WHERE status = 'complete'
  `);

  const result = stmt.run();
  return result.changes;
}

/**
 * Delete all files from the queue
 */
export function deleteAllFiles(): number {
  const database = getDatabase();

  const stmt = database.prepare(`DELETE FROM files`);

  const result = stmt.run();
  return result.changes;
}

/**
 * Parse tags from database record
 */
export function parseTags(record: FileRecord): string[] {
  if (!record.tags) return [];
  try {
    return JSON.parse(record.tags);
  } catch {
    return [];
  }
}
