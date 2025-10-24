-- Queue database schema for Evernote AI Importer
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
  note_url TEXT,
  note_guid TEXT,  -- Evernote note GUID
  content_hash TEXT  -- MD5 hash of extracted content for change detection
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_status ON files(status);
CREATE INDEX IF NOT EXISTS idx_file_path ON files(file_path);
CREATE INDEX IF NOT EXISTS idx_retry_after ON files(retry_after);

-- Note augmentation cache
-- Stores AI analysis results for note augmentation with expiry
CREATE TABLE IF NOT EXISTS note_augmentation_cache (
  note_guid TEXT PRIMARY KEY,
  ai_title TEXT NOT NULL,
  ai_description TEXT NOT NULL,
  ai_tags TEXT NOT NULL,  -- JSON array stored as string
  analyzed_at TEXT NOT NULL,  -- ISO timestamp
  content_hash TEXT NOT NULL,  -- MD5 hash of extracted content
  expires_at INTEGER NOT NULL  -- Unix timestamp in milliseconds (24 hours)
);

-- Index for cache cleanup queries
CREATE INDEX IF NOT EXISTS idx_note_cache_expires ON note_augmentation_cache(expires_at);
