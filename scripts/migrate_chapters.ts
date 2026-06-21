import { createClient } from "@libsql/client";

const db = createClient({ url: "file:sqlite.db" });

async function migrate() {
  console.log("Starting migration...");
  try {
    // 3. Update categories in topics
    const tGeo = await db.execute(`UPDATE topics SET category = 'Geography' WHERE category = 'Environment'`);
    const tGK = await db.execute(`UPDATE topics SET category = 'Static G.K.' WHERE category = 'Art & Culture'`);
    console.log(`Updated topics categories: ${tGeo.rowsAffected} to Geography, ${tGK.rowsAffected} to Static G.K.`);

    // 4. Update categories in staged_questions
    await db.execute(`UPDATE staged_questions SET category = 'Geography' WHERE category = 'Environment'`);
    await db.execute(`UPDATE staged_questions SET category = 'Static G.K.' WHERE category = 'Art & Culture'`);
    console.log("Updated staged_questions categories.");

    // 5. Update categories in questions
    await db.execute(`UPDATE questions SET category = 'Geography' WHERE category = 'Environment'`);
    await db.execute(`UPDATE questions SET category = 'Static G.K.' WHERE category = 'Art & Culture'`);
    console.log("Updated questions categories.");

    // 6. Best-effort mapping for existing topics
    await db.execute(`UPDATE topics SET chapter = 'Dance' WHERE lower(name) LIKE '%dance%' AND category = 'Static G.K.'`);
    console.log("Migration completed successfully.");
  } catch (e) {
    console.error("Migration failed:", String(e));
  }
}

migrate();
