const Database = require('better-sqlite3');
const db = new Database('./sqlite.db');

const tables = db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name").all();
console.log('\n=== Tables & FTS Virtual Tables ===');
tables.forEach(t => console.log(' -', t.name, `(${t.type})`));

const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
console.log('\n=== Triggers ===');
triggers.forEach(t => console.log(' -', t.name));

const settings = db.prepare("SELECT * FROM system_settings").all();
console.log('\n=== system_settings seed ===');
console.log(settings);

db.close();
console.log('\n✅ Database verification complete.');
