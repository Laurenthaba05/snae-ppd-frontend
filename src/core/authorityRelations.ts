/**
 * Relations entre notices d'autorité (ISAAR-CPF 5.3), vues depuis une notice. Le serveur les enregistre dans un sens
 * (TUTELLE : « source relève de cible » ; SUCCESSION : « source succède à cible » ; FAMILIALE et ASSOCIATIVE : sans sens) ;
 * l'écran les dit toujours du point de vue de la notice qu'on regarde, avec le nom de l'autre notice, jamais son identifiant.
 */
export type RelationType = 'TUTELLE' | 'SUCCESSION' | 'FAMILIALE' | 'ASSOCIATIVE';
export type AuthorityKind = 'PERSONNE' | 'COLLECTIVITE' | 'FAMILLE';

export interface RelationInput {
    institutionId: string; sourceId: string; targetId: string; type: RelationType;
    dateStart: string | null; dateEnd: string | null; description: string | null; version?: number;
}
export interface RelationView { id: string; input: RelationInput; version: number; updatedAt: string }
export interface AuthorityRef { id: string; code: string; name: string; kind: AuthorityKind }

/** Ce que l'archiviste choisit : le sens se lit depuis la notice courante (X). */
export interface RelationChoice { key: string; type: RelationType; xIsSource: boolean; label: string; short: string }
export const RELATION_CHOICES: ReadonlyArray<RelationChoice> = [
    { key: 'TUTELLE_SOURCE', type: 'TUTELLE', xIsSource: true, label: 'Est placée sous la tutelle de', short: 'Sous la tutelle de' },
    { key: 'TUTELLE_TARGET', type: 'TUTELLE', xIsSource: false, label: 'Exerce la tutelle sur', short: 'Exerce la tutelle sur' },
    { key: 'SUCCESSION_SOURCE', type: 'SUCCESSION', xIsSource: true, label: 'Succède à', short: 'Succède à' },
    { key: 'SUCCESSION_TARGET', type: 'SUCCESSION', xIsSource: false, label: 'A pour successeur', short: 'Remplacée par' },
    { key: 'FAMILIALE', type: 'FAMILIALE', xIsSource: true, label: 'Est liée par la parenté à', short: 'Parenté avec' },
    { key: 'ASSOCIATIVE', type: 'ASSOCIATIVE', xIsSource: true, label: 'Est associée à', short: 'Associée à' }
];
export const choiceOf = (type: RelationType, xIsSource: boolean): RelationChoice =>
    RELATION_CHOICES.find(c => c.type === type && (c.type === 'FAMILIALE' || c.type === 'ASSOCIATIVE' || c.xIsSource === xIsSource))!;

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « 2018 », « mars 2018 », « 14 février 2018 » à partir d'une date éventuellement partielle ; '' si elle est vide ou illisible. */
export function partialDateText(value: string | null | undefined): string {
    const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value ?? '');
    if (!m) return '';
    const [, year, month, day] = m;
    if (!month) return year!;
    const name = MONTHS[Number(month) - 1];
    if (!name) return '';
    return day ? `${Number(day) === 1 ? '1er' : Number(day)} ${name} ${year}` : `${name} ${year}`;
}
/** La période d'une relation en toutes lettres : « depuis 2018 », « jusqu’en 2021 », « de 2018 à 2021 », « 2020 » ; '' si aucune date. */
export function periodText(start: string | null | undefined, end: string | null | undefined): string {
    const from = partialDateText(start), to = partialDateText(end);
    if (from && to) return from === to ? from : `de ${from} à ${to}`;
    if (from) return `depuis ${from}`;
    if (to) return /^\d{4}$/.test(end ?? '') ? `jusqu’en ${to}` : `jusqu’au ${to}`;
    return '';
}

export interface RelationLine {
    id: string; version: number; type: RelationType; label: string; otherId: string; otherName: string; otherCode: string; period: string; description: string | null;
    xIsSource: boolean; dateStart: string | null; dateEnd: string | null; ended: boolean;
}
/** Les relations de la notice X, dites depuis X, triées par type puis par date de début. Une relation dont l'autre notice n'est plus lisible est comptée à part. */
export function linesOf(authorityId: string, relations: ReadonlyArray<RelationView>, authorities: ReadonlyArray<AuthorityRef>, today = new Date().toISOString().slice(0, 10)): { lines: RelationLine[]; unreadable: number } {
    const byId = new Map(authorities.map(a => [a.id, a] as const));
    const order: RelationType[] = ['TUTELLE', 'SUCCESSION', 'FAMILIALE', 'ASSOCIATIVE'];
    let unreadable = 0;
    const lines: RelationLine[] = [];
    for (const view of relations) {
        const r = view.input;
        if (r.sourceId !== authorityId && r.targetId !== authorityId) continue;
        const xIsSource = r.sourceId === authorityId;
        const other = byId.get(xIsSource ? r.targetId : r.sourceId);
        if (!other) { unreadable++; continue; }
        lines.push({ id: view.id, version: view.version, type: r.type, label: choiceOf(r.type, xIsSource).short, otherId: other.id, otherName: other.name, otherCode: other.code,
            period: periodText(r.dateStart, r.dateEnd), description: r.description, xIsSource, dateStart: r.dateStart, dateEnd: r.dateEnd,
            ended: !!r.dateEnd && upper(r.dateEnd) < today });
    }
    lines.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || (a.dateStart ?? '').localeCompare(b.dateStart ?? '') || a.otherName.localeCompare(b.otherName, 'fr'));
    return { lines, unreadable };
}

/** Dernier jour couvert par une date partielle (pour comparer sans calendrier). */
export function upper(date: string | null | undefined): string { return !date ? '9999-12-31' : date.length === 4 ? date + '-12-31' : date.length === 7 ? date + '-31' : date; }
/** Premier jour couvert. */
export function lower(date: string | null | undefined): string { return !date ? '0001-01-01' : date.length === 4 ? date + '-01-01' : date.length === 7 ? date + '-01' : date; }

export interface LineageStep { id: string; name: string; period: string }
/**
 * La filiation d'une collectivité : ses prédécesseurs (« succède à », de proche en proche) et ses successeurs (« remplacée par »), dans l'ordre où ils se suivent.
 * Une branche (fusion ou scission) donne plusieurs étapes à la même distance ; la chaîne s'arrête à 20 maillons ou à la première notice déjà vue.
 */
export function lineage(authorityId: string, relations: ReadonlyArray<RelationView>, authorities: ReadonlyArray<AuthorityRef>): { earlier: LineageStep[]; later: LineageStep[] } {
    const names = new Map(authorities.map(a => [a.id, a.name] as const));
    const succession = relations.filter(r => r.input.type === 'SUCCESSION');
    const walk = (from: string, direction: 'earlier' | 'later'): LineageStep[] => {
        const seen = new Set<string>([authorityId]);
        const steps: LineageStep[] = [];
        let frontier = [from];
        for (let depth = 0; depth < 20 && frontier.length; depth++) {
            const next: string[] = [];
            for (const node of frontier) {
                const edges = succession.filter(r => direction === 'earlier' ? r.input.sourceId === node : r.input.targetId === node)
                    .sort((a, b) => lower(a.input.dateStart).localeCompare(lower(b.input.dateStart)));
                for (const edge of edges) {
                    const id = direction === 'earlier' ? edge.input.targetId : edge.input.sourceId;
                    if (seen.has(id) || !names.has(id)) continue;
                    seen.add(id); next.push(id);
                    steps.push({ id, name: names.get(id)!, period: periodText(edge.input.dateStart, edge.input.dateEnd) });
                }
            }
            frontier = next;
        }
        return steps;
    };
    return { earlier: walk(authorityId, 'earlier').reverse(), later: walk(authorityId, 'later') };
}

/** La tutelle actuelle de la collectivité, puis celle de cette tutelle, de proche en proche (la relation la plus récente qui n'est pas terminée). */
export function tutelleChain(authorityId: string, relations: ReadonlyArray<RelationView>, authorities: ReadonlyArray<AuthorityRef>, today = new Date().toISOString().slice(0, 10)): string[] {
    const names = new Map(authorities.map(a => [a.id, a.name] as const));
    const chain: string[] = []; const seen = new Set<string>([authorityId]);
    let current = authorityId;
    for (let depth = 0; depth < 20; depth++) {
        const edge = relations.filter(r => r.input.type === 'TUTELLE' && r.input.sourceId === current && lower(r.input.dateStart) <= today && upper(r.input.dateEnd) >= today)
            .sort((a, b) => lower(b.input.dateStart).localeCompare(lower(a.input.dateStart)))[0];
        if (!edge || seen.has(edge.input.targetId) || !names.has(edge.input.targetId)) break;
        current = edge.input.targetId; seen.add(current); chain.push(names.get(current)!);
    }
    return chain;
}

export interface RelationForm { choiceKey: string; otherId: string; dateStart: string; dateEnd: string; description: string }
export const emptyRelationForm = (): RelationForm => ({ choiceKey: 'TUTELLE_SOURCE', otherId: '', dateStart: '', dateEnd: '', description: '' });

const DATE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;
function dateProblem(label: string, value: string): string | null {
    if (!value) return null;
    if (!DATE.test(value) || value.startsWith('0000')) return `${label} : AAAA, AAAA-MM ou AAAA-MM-JJ.`;
    if (value.length === 10) { const d = new Date(value + 'T00:00:00Z'); if (Number.isNaN(d.valueOf()) || d.toISOString().slice(0, 10) !== value) return `${label} : ce jour n’existe pas.`; }
    return null;
}
/** Les types permis selon le genre des deux notices : tutelle et succession entre collectivités, parenté entre personnes ou familles. */
export function typeAllowed(type: RelationType, a: AuthorityKind, b: AuthorityKind): boolean {
    if (type === 'TUTELLE' || type === 'SUCCESSION') return a === 'COLLECTIVITE' && b === 'COLLECTIVITE';
    if (type === 'FAMILIALE') return a !== 'COLLECTIVITE' && b !== 'COLLECTIVITE';
    return true;
}
/** Les choix de relation qui ont un sens pour cette notice (selon son genre). */
export const choicesFor = (kind: AuthorityKind): RelationChoice[] => RELATION_CHOICES.filter(c => typeAllowed(c.type, kind, kind));
/** Les notices qu'on peut lier à X par ce choix. */
export function candidates(choice: RelationChoice, x: AuthorityRef, authorities: ReadonlyArray<AuthorityRef>): AuthorityRef[] {
    return authorities.filter(a => a.id !== x.id && typeAllowed(choice.type, x.kind, a.kind)).sort((p, q) => p.name.localeCompare(q.name, 'fr'));
}
/** Contrôles avant l'envoi (le serveur reste seul juge, y compris pour les doublons et les boucles). */
export function relationProblems(form: RelationForm, x: AuthorityRef, authorities: ReadonlyArray<AuthorityRef>): string[] {
    const problems: string[] = [];
    const choice = RELATION_CHOICES.find(c => c.key === form.choiceKey);
    const other = authorities.find(a => a.id === form.otherId);
    if (!choice) problems.push('Choisissez la nature de la relation.');
    if (!other) problems.push('Choisissez l’autre notice.');
    if (choice && other && !typeAllowed(choice.type, x.kind, other.kind)) problems.push('Cette relation ne s’applique pas à ces deux types de notices.');
    const a = dateProblem('Date de début', form.dateStart.trim()), b = dateProblem('Date de fin', form.dateEnd.trim());
    if (a) problems.push(a);
    if (b) problems.push(b);
    if (!a && !b && form.dateStart.trim() && form.dateEnd.trim() && lower(form.dateStart.trim()) > upper(form.dateEnd.trim())) problems.push('La date de début dépasse la date de fin.');
    if (form.description.length > 10000) problems.push('Le commentaire dépasse 10 000 caractères.');
    return problems;
}
/** Le corps envoyé au serveur, dans le sens d'enregistrement. */
export function relationBody(form: RelationForm, x: AuthorityRef, institutionId: string, version?: number): RelationInput {
    const choice = RELATION_CHOICES.find(c => c.key === form.choiceKey)!;
    const sourceId = choice.xIsSource ? x.id : form.otherId, targetId = choice.xIsSource ? form.otherId : x.id;
    return { institutionId, sourceId, targetId, type: choice.type, dateStart: form.dateStart.trim() || null, dateEnd: form.dateEnd.trim() || null, description: form.description.trim() || null, ...(version === undefined ? {} : { version }) };
}
/** Le formulaire d'une relation existante, vue depuis X. */
export function formOf(view: RelationView, x: AuthorityRef): RelationForm {
    const r = view.input; const xIsSource = r.sourceId === x.id;
    return { choiceKey: choiceOf(r.type, xIsSource).key, otherId: xIsSource ? r.targetId : r.sourceId, dateStart: r.dateStart ?? '', dateEnd: r.dateEnd ?? '', description: r.description ?? '' };
}
