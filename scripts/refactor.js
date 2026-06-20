const fs = require('fs');
const path = require('path');

function processDir(dir) {
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf-8');
      
      // 1. rawSqlite.prepare(...).get(...)
      content = content.replace(/rawSqlite\s*\.\s*prepare\s*\((.*?)\)\s*\.\s*get\s*\((.*?)\)/gs, '(await rawSqlite.execute({ sql: $1, args: [$2] })).rows[0]');
      // 2. rawSqlite.prepare(...).all(...)
      content = content.replace(/rawSqlite\s*\.\s*prepare\s*\((.*?)\)\s*\.\s*all\s*\((.*?)\)/gs, '(await rawSqlite.execute({ sql: $1, args: [$2] })).rows');
      
      // 3. rawSqlite execute without args
      content = content.replace(/rawSqlite\s*\.\s*prepare\s*\((.*?)\)\s*\.\s*get\s*\(\s*\)/gs, '(await rawSqlite.execute($1)).rows[0]');
      content = content.replace(/rawSqlite\s*\.\s*prepare\s*\((.*?)\)\s*\.\s*all\s*\(\s*\)/gs, '(await rawSqlite.execute($1)).rows');

      // 4. db.xyz.get(), db.xyz.all(), db.xyz.run()
      content = content.replace(/(?<!await\s+)(db\.(?:select|insert|update|delete|transaction)[\s\S]*?\.(?:get|all|run)\s*\([\s\S]*?\))/g, 'await $1');

      fs.writeFileSync(fullPath, content);
    }
  }
}

processDir('repositories');
