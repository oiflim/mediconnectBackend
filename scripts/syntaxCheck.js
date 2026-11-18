import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve('src');
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) files.push(full);
  }
}
walk(root);
for (const file of [...files, path.resolve('scripts/seedAdmin.js'), path.resolve('scripts/createIndexes.js')]) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}
const collectionPath = path.resolve('postman/Hospital-Expo-Backend.postman_collection.json');
JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
console.log(`Syntax check passed for ${files.length + 1} JavaScript files; Postman collection JSON is valid.`);
