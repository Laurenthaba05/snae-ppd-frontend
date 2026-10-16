// Catalogue anglais des écrans : gèle les textes français à traduire en lots numérotés, puis assemble les traductions en `src/core/i18nScreens.ts`.
//
//   node scripts/i18n-build.mjs freeze   écrit scripts/i18n/NN.fr.txt pour les textes pas encore gelés ni déjà au catalogue de base
//   node scripts/i18n-build.mjs build    lit scripts/i18n/NN.fr.txt et NN.en.txt, génère src/core/i18nScreens.ts (erreur si un lot est incohérent)
//   node scripts/i18n-build.mjs status   dit combien de textes sont gelés, traduits et restent à traduire
//
// Format : une ligne par texte, `numéro<TAB>texte`. Les fichiers .en.txt portent le même numéro. Les `{n}` d'un texte français sont des valeurs ; la traduction les reprend par
// `{1}`, `{2}`… dans l'ordre. Une ligne vide ou absente dans un .en.txt = pas encore traduit (le texte reste en français).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractTexts } from './extract-i18n.mjs';

const DIR = fileURLToPath(new URL('./i18n/', import.meta.url));
const OUT = fileURLToPath(new URL('../src/core/i18nScreens.ts', import.meta.url));
const BASE = fileURLToPath(new URL('../src/core/i18n.ts', import.meta.url));
const CHUNK = 220;

const parse = path => new Map(readFileSync(path, 'utf8').split(/\r?\n/).filter(l => l.length).map(line => {
    const tab = line.indexOf('\t');
    if (tab < 0) throw new Error(`${path} : ligne sans tabulation : ${line.slice(0, 60)}`);
    return [Number(line.slice(0, tab)), line.slice(tab + 1)];
}));
const chunks = suffix => (existsSync(DIR) ? readdirSync(DIR).filter(n => n.endsWith(suffix)).sort() : []);
const baseKeys = () => {
    const source = readFileSync(BASE, 'utf8');
    const keys = new Set();
    for (const m of source.matchAll(/^\s*'((?:[^'\\]|\\.)*)'\s*:/gm)) keys.add(m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
    return keys;
};

function frozen() {
    const all = new Map();
    for (const name of chunks('.fr.txt')) for (const [i, text] of parse(join(DIR, name))) all.set(`${name.split('.')[0]}:${i}`, text);
    return all;
}

const command = process.argv[2];
if (command === 'freeze') {
    mkdirSync(DIR, { recursive: true });
    const known = new Set([...frozen().values(), ...baseKeys()]);
    const fresh = [...extractTexts().keys()].filter(t => !known.has(t));
    let next = chunks('.fr.txt').length;
    for (let i = 0; i < fresh.length; i += CHUNK) {
        const name = String(next++).padStart(3, '0');
        writeFileSync(join(DIR, `${name}.fr.txt`), fresh.slice(i, i + CHUNK).map((t, j) => `${j + 1}\t${t}`).join('\n') + '\n');
    }
    console.log(`${fresh.length} textes nouveaux gelés en ${Math.ceil(fresh.length / CHUNK)} lot(s)`);
} else if (command === 'build' || command === 'status') {
    const catalog = {};
    let total = 0, translated = 0;
    const problems = [];
    for (const name of chunks('.fr.txt')) {
        const id = name.split('.')[0];
        const fr = parse(join(DIR, name));
        const enPath = join(DIR, `${id}.en.txt`);
        const en = existsSync(enPath) ? parse(enPath) : new Map();
        for (const [i, text] of fr) {
            total++;
            const target = en.get(i);
            if (target === undefined || target.trim() === '') continue;
            translated++;
            const sources = (text.match(/\{n\}/g) ?? []).length;
            const used = [...target.matchAll(/\{(\d+)\}/g)].map(m => Number(m[1]));
            if (sources !== new Set(used).size || used.some(n => n < 1 || n > sources)) problems.push(`${id}:${i} valeurs {n} (${sources}) et {k} (${used.join(',')}) incohérentes : ${text.slice(0, 50)}`);
            if (target !== target.trim()) problems.push(`${id}:${i} espaces en bordure`);
            if (catalog[text] !== undefined && catalog[text] !== target) problems.push(`${id}:${i} texte déjà traduit autrement : ${text.slice(0, 50)}`);
            catalog[text] = target;
        }
        for (const i of en.keys()) if (!fr.has(i)) problems.push(`${id}.en.txt : numéro ${i} inconnu`);
    }
    console.log(`${total} textes gelés, ${translated} traduits, ${total - translated} restent à traduire`);
    if (problems.length) { console.error(problems.join('\n')); if (command === 'build') process.exit(1); }
    if (command === 'build') {
        const lines = Object.entries(catalog).sort((a, b) => a[0].localeCompare(b[0], 'fr')).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
        writeFileSync(OUT, `// Fichier GÉNÉRÉ par \`node scripts/i18n-build.mjs build\` à partir de scripts/i18n/*.txt : ne pas le modifier à la main.\n// ${translated} textes des écrans métier (français → anglais). Une clé avec {n} est un modèle : voir registerCatalog dans core/i18n.ts.\n` +
            `export const EN_SCREENS: Readonly<Record<string, string>> = {\n${lines.join(',\n')}\n};\n`);
        console.log(`écrit ${OUT}`);
    }
} else {
    console.error('usage : node scripts/i18n-build.mjs freeze | build | status');
    process.exit(2);
}
