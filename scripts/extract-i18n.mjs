// Extraction des textes français de l'interface (outil de développement, hors exécution) : parcourt src/ avec le compilateur TypeScript et liste
//  - les textes JSX (entre balises) ;
//  - les valeurs littérales des attributs JSX qui portent du texte (title, aria-label, placeholder, label…) ;
//  - les chaînes littérales qui ressemblent à du français (accents ou mots courants) dans le code des écrans et des libellés ;
//  - les gabarits de texte à valeurs simples (`Sur ${n} fichiers`), avec `{n}` à la place de chaque valeur ; un pluriel écrit `${n > 1 ? 's' : ''}` ou `${plural(n, 'ligne', 'lignes')}` donne les deux formes.
// Usage : node scripts/extract-i18n.mjs [fichier.json]   (ou importé par scripts/i18n-build.mjs)
import ts from 'typescript';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../src/', import.meta.url));
const SKIP_DIRS = new Set();
// Le catalogue lui-même et le traducteur sont exclus ; les parcours (design/journeys.ts) et les données de la démonstration (demo/) sont extraits : ils s'affichent dans l'interface.
const SKIP_FILES = new Set(['i18n.ts', 'i18nScreens.ts', 'domTranslator.ts']);
const TEXT_ATTRS = new Set(['title', 'aria-label', 'aria-description', 'placeholder', 'alt', 'label', 'description', 'subtitle', 'eyebrow', 'confirm', 'hint', 'summary', 'caption', 'text', 'message', 'heading', 'emptyTitle', 'emptyDescription', 'cta', 'help']);
const FRENCH_WORD = /(^|[\s’'(])(le|la|les|des|du|de|un|une|et|ou|pour|sur|avec|sans|dans|est|sont|par|au|aux|ce|cette|ces|vous|votre|vos|aucun|aucune|non|pas|plus|d’|l’|à)([\s’',.:;)]|$)/i;
const ACCENTED = /[àâäçéèêëîïôöùûüœÀÂÉÈÊÎÔÙÛÇ]/;

function files(dir) {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return SKIP_DIRS.has(name) ? [] : files(path);
        return /\.(ts|tsx)$/.test(name) && !SKIP_FILES.has(name) ? [path] : [];
    });
}

const looksFrench = s => s.length >= 4 && (ACCENTED.test(s) || (s.includes(' ') && FRENCH_WORD.test(s)));

/** Les variantes d'un gabarit : null si une valeur n'est pas simple. */
function templateVariants(node, source) {
    const simple = e => ts.isIdentifier(e) || ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e) || (ts.isCallExpression(e) && e.arguments.length <= 2 && !e.getText(source).includes('=>'))
        || ts.isNonNullExpression(e) || ts.isParenthesizedExpression(e) && simple(e.expression) || (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken);
    let variants = [node.head.text];
    for (const span of node.templateSpans) {
        const e = span.expression;
        let options;
        if (ts.isConditionalExpression(e) && ts.isStringLiteralLike(e.whenTrue) && ts.isStringLiteralLike(e.whenFalse)) options = [e.whenTrue.text, e.whenFalse.text];
        else if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'plural' && e.arguments.length === 3
            && ts.isStringLiteralLike(e.arguments[1]) && ts.isStringLiteralLike(e.arguments[2])) options = [`{n} ${e.arguments[1].text}`, `{n} ${e.arguments[2].text}`]; // plural(n, 'ligne', 'lignes')
        else if (simple(e)) options = ['{n}'];
        else return null;
        variants = variants.flatMap(v => options.map(o => v + o + span.literal.text));
        if (variants.length > 8) return null;
    }
    return variants;
}

export function extractTexts() {
    const found = new Map();
    const add = (text, file) => {
        const t = text.replace(/\s+/g, ' ').trim();
        if (t.length < 2 || !/\p{L}/u.test(t.replace(/\{n\}/g, ''))) return;
        const entry = found.get(t) ?? { count: 0, files: new Set() };
        entry.count++; entry.files.add(file);
        found.set(t, entry);
    };
    for (const path of files(ROOT)) {
        const text = readFileSync(path, 'utf8');
        const source = ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
        const rel = relative(ROOT, path).replace(/\\/g, '/');
        const visit = node => {
            if (ts.isJsxText(node)) add(node.getText(source), rel);
            else if (ts.isJsxAttribute(node) && node.initializer) {
                const name = node.name.getText(source);
                let value = null;
                if (ts.isStringLiteral(node.initializer)) value = node.initializer.text;
                else if (ts.isJsxExpression(node.initializer) && node.initializer.expression && (ts.isStringLiteral(node.initializer.expression) || ts.isNoSubstitutionTemplateLiteral(node.initializer.expression)))
                    value = node.initializer.expression.text;
                if (value !== null && (TEXT_ATTRS.has(name) || looksFrench(value)) && !/^(className|style|type|href|src|id|htmlFor|key|role|name|value|to|target|rel)$/.test(name)) add(value, rel);
            } else if (ts.isTemplateExpression(node)) {
                const variants = templateVariants(node, source);
                if (variants) for (const v of variants) { const bare = v.replace(/\{n\}/g, ' '); if (looksFrench(bare.trim()) && !/^[/.#]/.test(v)) add(v, rel); }
            } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !ts.isJsxAttribute(node.parent) && !ts.isImportDeclaration(node.parent) && !ts.isExportDeclaration(node.parent)
                && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node) && !ts.isLiteralTypeNode(node.parent) && !ts.isElementAccessExpression(node.parent)) {
                if (looksFrench(node.text)) add(node.text, rel);
            }
            ts.forEachChild(node, visit);
        };
        visit(source);
    }
    return new Map([...found.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr')));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const found = extractTexts();
    const out = Object.fromEntries([...found.entries()].map(([k, v]) => [k, { n: v.count, f: [...v.files].slice(0, 3).join(',') }]));
    const json = JSON.stringify(out, null, 1);
    if (process.argv[2]) writeFileSync(process.argv[2], json); else console.log(json);
    console.error(`${found.size} textes distincts`);
}
