-- ReviewBlox D1 schema
CREATE TABLE IF NOT EXISTS reviews (
  id       TEXT PRIMARY KEY,
  game     TEXT NOT NULL,
  author   TEXT NOT NULL DEFAULT 'Anonymous',
  rating   INTEGER NOT NULL,
  genres   TEXT NOT NULL DEFAULT '[]',  -- JSON array
  body     TEXT NOT NULL DEFAULT '',
  likes    INTEGER NOT NULL DEFAULT 0,
  date     INTEGER NOT NULL,
  edited   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_reviews_game ON reviews(game);
CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews(date);

CREATE TABLE IF NOT EXISTS critics (
  name TEXT PRIMARY KEY COLLATE NOCASE
);
