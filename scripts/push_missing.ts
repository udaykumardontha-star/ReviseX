import { createClient } from '@libsql/client';
import { resolve } from 'path';

async function run() {
  const localUrl = 'file:' + resolve(process.cwd(), 'sqlite.db');
  const remoteUrl = process.env.DATABASE_URL;
  const remoteToken = process.env.TURSO_AUTH_TOKEN;

  console.log('Connecting to', localUrl, 'and', remoteUrl);

  const localClient = createClient({ url: localUrl });
  const remoteClient = createClient({ url: remoteUrl, authToken: remoteToken });

  const missingTables = ['note_keywords', 'note_facts', 'notes_versions', 'topic_aliases'];

  for (const table of missingTables) {
    console.log(`Syncing ${table}...`);
    const result = await localClient.execute(`SELECT * FROM ${table}`);
    const rows = result.rows;
    if (rows.length === 0) continue;
    
    const columns = result.columns;
    const placeholders = columns.map(() => '?').join(', ');
    const insertSql = `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

    const tx = await remoteClient.transaction('write');
    try {
      for (const row of rows) {
        const args = columns.map(col => row[col] ?? null) as any[];
        await tx.execute({ sql: insertSql, args });
      }
      await tx.commit();
      console.log(`Synced ${rows.length} rows for ${table}`);
    } catch (e) {
      console.error(e);
      await tx.rollback();
    }
  }
  
  await remoteClient.execute('UPDATE topics SET total_facts = (SELECT COUNT(*) FROM note_facts WHERE note_facts.note_id IN (SELECT id FROM notes WHERE topic_id = topics.id AND is_deleted = 0))');
  
  console.log('Done!');
  localClient.close();
  remoteClient.close();
}
run();
