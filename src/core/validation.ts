export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuid(value: string): string {
    if (!UUID_RE.test(value) || value === '00000000-0000-0000-0000-000000000000')
        throw new Error('Un identifiant UUID valide est requis.');
    return value.toLowerCase();
}
export function code(value: string, max = 50): string {
    const v = value.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_-]*$/.test(v) || v.length > max)
        throw new Error('Le code doit commencer par une lettre : lettres, chiffres, _ et - uniquement.');
    return v;
}
export function text(value: string, max: number, required = true): string | null {
    const v = value.trim();
    if (!v && !required)
        return null;
    // eslint-disable-next-line no-control-regex -- refuser les caractères de contrôle est le but de ce contrôle
    if (!v || v.length > max || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(v))
        throw new Error(`Texte requis, au maximum ${max} caractères.`);
    return v;
}
export function utc(value: string): string | null {
    if (!value)
        return null;
    const n = Date.parse(value);
    if (!Number.isFinite(n))
        throw new Error('Date invalide.');
    return new Date(n).toISOString();
}
export function scopeCheck(scope: string, institutionId: string | null, departmentId: string | null, account = 'USER'): void {
    if (!['USER', 'SERVICE'].includes(account))
        throw new Error('Type de compte inconnu.');
    if (account === 'SERVICE') {
        if (scope !== 'SERVICE' || (departmentId && !institutionId))
            throw new Error('Compte technique : portée SERVICE et rattachements cohérents requis.');
        return;
    }
    const good = scope === 'NATIONAL' ? !institutionId && !departmentId : scope === 'INSTITUTION' ? !!institutionId && !departmentId : scope === 'DEPARTEMENT' && !!institutionId && !!departmentId;
    if (!good)
        throw new Error('La portée doit correspondre aux rattachements institution / département.');
}
export function period(start: string | null, end: string | null, now = Date.now()): void {
    const s = start ? Date.parse(start) : now;
    if (!Number.isFinite(s) || (end && (!Number.isFinite(Date.parse(end)) || Date.parse(end) <= s || Date.parse(end) <= now)))
        throw new Error('La fin doit être future et postérieure au début.');
}
export function canonical(value: unknown): string {
    if (typeof value === 'number' && !Number.isFinite(value))
        throw new Error('Nombre JSON non fini.');
    if (value === null || ['string', 'boolean', 'number'].includes(typeof value))
        return JSON.stringify(value);
    if (Array.isArray(value))
        return '[' + value.map(canonical).join(',') + ']';
    if (typeof value === 'object')
        return '{' + Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
    throw new Error('Valeur non sérialisable.');
}
export class IntentKey {
    private fingerprint = '';
    private key = '';
    forRequest(method: string, path: string, body: unknown): string {
        const fp = canonical({ method, path, body });
        if (fp !== this.fingerprint) {
            this.fingerprint = fp;
            this.key = crypto.randomUUID();
        }
        return this.key;
    }
    clear(): void { this.key = ''; this.fingerprint = ''; }
}
