// Somme la mesure de couverture écrite par les suites d'écrans (tests/ui/i18n-coverage.setup.ts).
//
//   I18N_COVERAGE_OUT=couverture.jsonl npx vitest run --config vitest.config.ts
//   node scripts/i18n-coverage.mjs couverture.jsonl [nombre de textes à lister]
//
// Chaque ligne est un test : textes « couverts » par le catalogue, « français hors catalogue » (ressemble à du français, aucune traduction) et « autres » (noms, codes, données).
// Ce sont des nœuds de texte affichés, comptés une fois par test : un texte vu dans dix tests compte dix fois. La liste des textes absents, elle, est dédoublonnée.
import { readFileSync } from 'node:fs';

const [file, limit = '40'] = process.argv.slice(2);
if (!file) { console.error('usage : node scripts/i18n-coverage.mjs <fichier.jsonl> [n]'); process.exit(2); }
const rows = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const sum = key => rows.reduce((total, row) => total + row[key], 0);
const covered = sum('covered'), french = sum('french'), other = sum('other');
const translatable = covered + french;
const percent = (a, b) => (b === 0 ? 'n/a' : (100 * a / b).toFixed(1) + ' %');

console.log(`${rows.length} tests mesurés, ${new Set(rows.map(r => r.file)).size} fichiers`);
console.log(`textes affichés : ${covered + french + other} (couverts ${covered}, français hors catalogue ${french}, autres ${other})`);
console.log(`couverture sur les textes qui ressemblent à du français : ${percent(covered, translatable)}`);

const distinct = new Map();
for (const row of rows) for (const text of row.frenchTexts) distinct.set(text, (distinct.get(text) ?? 0) + 1);
console.log(`textes français distincts hors catalogue (échantillon borné par test) : ${distinct.size}`);

const byFile = new Map();
for (const row of rows) {
    const entry = byFile.get(row.file) ?? { covered: 0, french: 0 };
    entry.covered += row.covered; entry.french += row.french;
    byFile.set(row.file, entry);
}
console.log('\nfichiers avec le plus de français hors catalogue :');
for (const [name, e] of [...byFile.entries()].sort((a, b) => b[1].french - a[1].french).slice(0, 12)) console.log(`  ${String(e.french).padStart(5)} / ${String(e.covered + e.french).padStart(5)}  ${name}`);

console.log('\ntextes les plus fréquents hors catalogue :');
for (const [text, n] of [...distinct.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(limit))) console.log(`  ${String(n).padStart(4)}×  ${text}`);
