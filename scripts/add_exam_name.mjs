import { createClient } from "@libsql/client";

const client = createClient({
  url: "file:sqlite.db",
});

async function run() {
  try {
    console.log("Adding exam_name to questions...");
    await client.execute("ALTER TABLE questions ADD COLUMN exam_name TEXT;");
    console.log("Added to questions");
  } catch (err) {
    console.log("Skipping questions:", err.message);
  }

  try {
    console.log("Adding exam_name to staged_questions...");
    await client.execute("ALTER TABLE staged_questions ADD COLUMN exam_name TEXT;");
    console.log("Added to staged_questions");
  } catch (err) {
    console.log("Skipping staged_questions:", err.message);
  }

  console.log("Done");
}

run();
