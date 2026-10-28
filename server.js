const express = require('express');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const rootDir = __dirname;
const dataDir = path.join(rootDir, 'data');

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'orbus-map.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS map_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    custom_locations TEXT NOT NULL DEFAULT '[]',
    deleted_locations TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  INSERT OR IGNORE INTO map_state (id, custom_locations, deleted_locations)
  VALUES (1, '[]', '[]');
`);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(rootDir));

app.get('/api/health', (_req, res) => {
  try {
    readState();
    db.prepare('PRAGMA quick_check').get();
    res.json({ ok: true, status: 'ready', database: 'online' });
  } catch (error) {
    res.status(503).json({ ok: false, status: 'database unavailable' });
  }
});

function readState() {
  const row = db.prepare('SELECT custom_locations, deleted_locations FROM map_state WHERE id = 1').get();

  return {
    customLocations: safeParse(row.custom_locations, []),
    deletedLocations: safeParse(row.deleted_locations, [])
  };
}

function safeParse(value, fallback) {
  try {
    const parsed = JSON.parse(value || 'null');
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    console.error('Invalid JSON in database state', error);
    return fallback;
  }
}

app.get('/api/map-state', (_req, res) => {
  res.json(readState());
});

app.post('/api/map-state', (req, res) => {
  const incoming = req.body || {};
  const customLocations = Array.isArray(incoming.customLocations) ? incoming.customLocations : [];
  const deletedLocations = Array.isArray(incoming.deletedLocations) ? incoming.deletedLocations : [];

  const customJson = JSON.stringify(customLocations);
  const deletedJson = JSON.stringify(deletedLocations);

  db.prepare(`
    UPDATE map_state
    SET custom_locations = ?, deleted_locations = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(customJson, deletedJson);

  res.json({ customLocations, deletedLocations });
});

app.listen(PORT, HOST, () => {
  console.log(`Orbus Maps server running at http://${HOST}:${PORT}`);
});
