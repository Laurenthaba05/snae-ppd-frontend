// Compare les types que le frontend attend des réponses du serveur avec le contrat du serveur (`docs/api-contrat.json` du dépôt du serveur, généré par ApiContractSnapshotTest).
//
//   node scripts/check-contract.mjs [chemin/du/api-contrat.json]
//
// Pour chaque méthode de `src/api/*.ts` dont le corps est `return this.transport.request('/chemin', { method })`, on retrouve la route du contrat (méthode + chemin), puis on compare
// les propriétés de l'interface TypeScript de la réponse à celles que le serveur envoie :
//   - « manquant »   : une propriété **obligatoire** du frontend que le serveur n'envoie pas (l'écran lirait undefined) ;
//   - « facultatif » : une propriété facultative du frontend que le serveur n'envoie pas ;
//   - « ignoré »     : une propriété envoyée par le serveur que le frontend ne déclare pas (informatif).
// Ce n'est pas une preuve de conformité : seuls les noms de propriétés de premier niveau sont comparés (et ceux des éléments d'une liste), pas leurs types.
import ts from 'typescript';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_CONTRACT = resolve(ROOT, '..', 'snae-ppd-backend-v12.1', 'docs', 'api-contrat.json');
const API_PREFIX = '/api/v1';

const normalizeContractPath = path => path.replace(API_PREFIX, '').replace(/\{[^}/]*\}/g, '{}').replace(/\.csv$|\.json$/, m => m).replace(/\/+$/, '') || '/';

/** Le texte d'un chemin construit par concaténation : les valeurs (identifiants, requêtes) deviennent `{}` ou disparaissent. */
function pathOf(expression) {
    if (ts.isStringLiteralLike(expression)) return expression.text;
    if (ts.isTemplateExpression(expression)) return expression.head.text + expression.templateSpans.map(span => '{}' + span.literal.text).join('');
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const right = expression.right;
        if (ts.isCallExpression(right) && ts.isIdentifier(right.expression) && right.expression.text === 'query') return pathOf(expression.left);
        return pathOf(expression.left) + (ts.isStringLiteralLike(right) || ts.isTemplateExpression(right) || ts.isBinaryExpression(right) ? pathOf(right) : '{}');
    }
    return '{}';
}

export function frontendCalls() {
    const apiDir = join(ROOT, 'src', 'api');
    const files = readdirSync(apiDir).filter(name => name.endsWith('.ts')).map(name => join(apiDir, name));
    const program = ts.createProgram(files, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, skipLibCheck: true, noEmit: true, allowImportingTsExtensions: true });
    const checker = program.getTypeChecker();
    const calls = [];
    for (const file of files) {
        const source = program.getSourceFile(file);
        const visit = node => {
            if (ts.isMethodDeclaration(node) && node.body && node.type && ts.isTypeReferenceNode(node.type) && node.type.typeName.getText() === 'Promise') {
                const ret = node.body.statements.find(ts.isReturnStatement);
                const call = ret?.expression;
                if (call && ts.isCallExpression(call) && call.expression.getText() === 'this.transport.request' && call.arguments.length >= 1) {
                    let method = 'GET';
                    let options = call.arguments[1];
                    while (options && (ts.isSatisfiesExpression(options) || ts.isAsExpression(options) || ts.isParenthesizedExpression(options))) options = options.expression;
                    if (options && ts.isObjectLiteralExpression(options)) {
                        const m = options.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText() === 'method');
                        if (m && ts.isPropertyAssignment(m) && ts.isStringLiteralLike(m.initializer)) method = m.initializer.text;
                    }
                    const raw = pathOf(call.arguments[0]);
                    const path = raw.split('?')[0].replace(/\/+$/, '');
                    if (path.startsWith('/')) calls.push({ file: file.slice(ROOT.length + 1).replace(/\\/g, '/'), name: node.name.getText(), method, path, typeNode: node.type.typeArguments?.[0], checker });
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(source);
    }
    return calls;
}

/** Les propriétés d'un type du frontend : { name, optional }, avec l'élément pour une liste. */
function propertiesOf(typeNode, checker) {
    let type = checker.getTypeFromTypeNode(typeNode);
    let list = false;
    if (checker.isArrayType(type)) { list = true; type = checker.getTypeArguments(type)[0]; }
    if (!type || type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Void | ts.TypeFlags.Undefined)) return null;
    if (type.isUnion()) return null;
    const symbol = type.getSymbol();
    if (!symbol || ['Blob', 'Array', 'Record', 'Map'].includes(symbol.getName())) return null;
    const props = checker.getPropertiesOfType(type).map(p => ({ name: p.getName(), optional: !!(p.flags & ts.SymbolFlags.Optional) }));
    return props.length ? { list, name: checker.typeToString(type), props } : null;
}

function serverProperties(contract, shape) {
    let node = shape;
    let list = false;
    if (Array.isArray(node)) { list = true; node = node[0]; }
    if (typeof node !== 'string' || !node.startsWith('#')) return null;
    const schema = contract.schemas[node.slice(1)];
    if (!schema || typeof schema !== 'object') return null;
    return { list, name: node.slice(1), props: Object.keys(schema).map(key => ({ name: key.replace(/\?$/, ''), nullable: key.endsWith('?') })) };
}

export function compareContract(contractPath = process.env.SNAE_API_CONTRACT ?? DEFAULT_CONTRACT) {
    const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
    const routes = new Map();
    for (const [key, value] of Object.entries(contract.routes)) {
        const space = key.indexOf(' ');
        routes.set(key.slice(0, space) + ' ' + normalizeContractPath(key.slice(space + 1)), value);
    }
    const findings = [], unmatched = [];
    let compared = 0;
    for (const call of frontendCalls()) {
        const route = routes.get(call.method + ' ' + normalizeContractPath(call.path));
        if (!route) { unmatched.push(`${call.method} ${call.path} (${call.file}#${call.name})`); continue; }
        const server = serverProperties(contract, route.returns);
        const front = propertiesOf(call.typeNode, call.checker);
        if (!server || !front) continue;
        compared++;
        if (front.list !== server.list) { findings.push({ kind: 'forme', call: `${call.method} ${call.path}`, detail: `le frontend attend ${front.list ? 'une liste' : 'un objet'}, le serveur envoie ${server.list ? 'une liste' : 'un objet'}`, where: `${call.file}#${call.name}` }); continue; }
        const sent = new Set(server.props.map(p => p.name));
        const declared = new Set(front.props.map(p => p.name));
        for (const p of front.props) if (!sent.has(p.name)) findings.push({ kind: p.optional ? 'facultatif' : 'manquant', call: `${call.method} ${call.path}`, detail: `${front.name}.${p.name} : le serveur (${server.name}) ne l'envoie pas`, where: `${call.file}#${call.name}` });
        for (const p of server.props) if (!declared.has(p.name)) findings.push({ kind: 'ignoré', call: `${call.method} ${call.path}`, detail: `${server.name}.${p.name} n'est pas déclaré par ${front.name}`, where: `${call.file}#${call.name}` });
    }
    return { compared, findings, unmatched, routes: routes.size };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    const path = process.argv[2] ?? process.env.SNAE_API_CONTRACT ?? DEFAULT_CONTRACT;
    if (!existsSync(path)) { console.error(`contrat introuvable : ${path}`); process.exit(2); }
    const result = compareContract(path);
    const by = kind => result.findings.filter(f => f.kind === kind);
    console.log(`${result.compared} réponses comparées sur ${result.routes} routes ; ${result.unmatched.length} appels sans route du contrat`);
    for (const kind of ['forme', 'manquant', 'facultatif']) {
        console.log(`\n${kind} : ${by(kind).length}`);
        for (const f of by(kind).slice(0, 80)) console.log(`  ${f.call}  ${f.detail}  [${f.where}]`);
    }
    console.log(`\nignoré (informatif) : ${by('ignoré').length}`);
    if (result.unmatched.length) { console.log('\nappels sans route :'); for (const u of result.unmatched.slice(0, 40)) console.log('  ' + u); }
}
