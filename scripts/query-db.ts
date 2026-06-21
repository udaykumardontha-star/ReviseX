import { db } from "../db/connection";
import { sql } from "drizzle-orm";

async function run() {
  console.log("Starting migration fix...");

  // Update questions where category is 'English' to inherit category from their topic name
  // Or if they don't have a topic, just rename them to "Miscellaneous" or something, but wait, let's see them first.
  const questions = await db.all(sql`SELECT id, category, topic_id FROM questions WHERE category = 'English'`);
  console.log("Questions to update:", questions);

  for (const q of questions) {
    if (q.topic_id) {
      const topic = await db.all(sql`SELECT name FROM topics WHERE id = ${q.topic_id}`);
      if (topic.length > 0) {
        await db.run(sql`UPDATE questions SET category = ${topic[0].name} WHERE id = ${q.id}`);
        console.log(`Updated question ${q.id} to category ${topic[0].name}`);
      }
    } else {
      // If no topic, what to do? Let's assume it's Miscellaneous
      await db.run(sql`UPDATE questions SET category = 'Miscellaneous' WHERE id = ${q.id}`);
      console.log(`Updated question ${q.id} to Miscellaneous`);
    }
  }

  // Update topics where category is 'English' to have category = name
  await db.run(sql`UPDATE topics SET category = name WHERE category = 'English'`);
  console.log("Updated topics.");
  
  // Also check staged_questions
  const staged = await db.all(sql`SELECT id, category FROM staged_questions WHERE category = 'English'`);
  console.log("Staged to update:", staged);
  await db.run(sql`UPDATE staged_questions SET category = 'Miscellaneous' WHERE category = 'English'`);

}

run().catch(console.error);
