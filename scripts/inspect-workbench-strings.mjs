import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveCursorAppRoot } = require('../workbenchPatcher');

const appRoot = resolveCursorAppRoot(process.argv[2]);
const targetPath = path.join(appRoot, 'out', 'vs', 'workbench', 'workbench.desktop.main.js');
const terms = process.argv.slice(3);
const searchTerms = terms.length > 0 ? terms : [
  'New Agent',
  'Add an agent to get started',
  'New Chat',
  'Open agent ${a}',
  'Referenced by ${s}',
  'Auto-run Mode',
  'Allow selected',
  'Deselect all',
  'Ask Question',
  'Switch Mode',
  'Reflect',
  'Truncated'
];

const content = fs.readFileSync(targetPath, 'utf8');
console.log(`target=${targetPath}`);

for (const term of searchTerms) {
  const hits = [];
  let index = -1;
  while ((index = content.indexOf(term, index + 1)) !== -1) {
    hits.push(index);
  }

  console.log(`\n## ${term} (${hits.length})`);
  for (const hit of hits.slice(0, 5)) {
    const start = Math.max(0, hit - 180);
    const end = Math.min(content.length, hit + term.length + 220);
    console.log(content.slice(start, end).replace(/\s+/g, ' '));
  }
}