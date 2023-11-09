import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function cleanTypes(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);

    if (fs.statSync(fullPath).isDirectory()) {
      cleanTypes(fullPath);
    } else if (fullPath.endsWith('.d.ts')) {
      let content = fs.readFileSync(fullPath, 'utf-8');

      // Remove any property or method declaration that starts with `_` inside classes/interfaces.
      content = content.replace(/^[ \t]*(readonly )?_[\s\S]*?\n/gm, '');

      fs.writeFileSync(fullPath, content, 'utf-8');
    }
  }
}

const typesDir = path.resolve(__dirname, '../dist/types');
if (fs.existsSync(typesDir)) {
  cleanTypes(typesDir);
  console.log('Successfully cleaned internal _props from generated types.');
} else {
  console.warn('Types directory not found:', typesDir);
}
