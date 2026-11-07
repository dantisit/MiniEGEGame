// Rebuild the browser data from the user-supplied spelling table:
// node scripts/build-spelling-data.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../src/data/', import.meta.url);
const lines = readFileSync(new URL('spelling-table.tsv', root), 'utf8').trimEnd().split(/\r?\n/);
const rows = [];
const keys = new Set();
for (const [index, line] of lines.slice(1).entries()) {
  const [displayWord, displayMask, wrong, hidden, ...extra] = line.split('\t');
  const word = displayWord?.replace(/\s+\([^)]*\)$/, '');
  const mask = displayMask?.replace(/\s+\([^)]*\)$/, '');
  const position = mask?.indexOf('_');
  const key = `${word}\0${mask}`;
  if (extra.length || !/^[а-яё]+$/u.test(word) ||
      (mask.match(/_/g) || []).length !== 1 ||
      mask.replace('_', word[position]) !== word ||
      !(/^[а-яё]$/u.test(wrong) || wrong === '!') ||
      wrong === word[position] || !['0', '1'].includes(hidden) || keys.has(key)) {
    throw new Error(`Invalid or duplicate spelling table row ${index + 2}: ${line}`);
  }
  keys.add(key);
  rows.push([word, mask, wrong, Number(hidden)]);
}
writeFileSync(new URL('exercises.js', root),
  `/* Generated from spelling-table.tsv by scripts/build-spelling-data.mjs.\n` +
  `   Each row is a distinct gap; the fourth value is the default hidden flag. */\n` +
  `const DEFAULT_EXERCISES = [\n${rows.map(row => `  ${JSON.stringify(row)},`).join('\n')}\n];\n`);
console.log(`${rows.length} gaps, ${rows.filter(row => row[3]).length} hidden by default`);
