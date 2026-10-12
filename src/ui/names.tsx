import React, { useEffect, useState } from 'react';
import { useSession } from '../auth/session';
import type { Catalog, ScopeTarget } from '../core/types';

/**
 * Les noms que l'interface montre à la place des identifiants. Un nom se demande une seule fois par session (clé : institution de session + type + identifiant) ; si le serveur
 * le refuse ou ne répond pas, on ne montre jamais l'identifiant : un texte neutre le remplace.
 */
type Named = { nom?: string | null; prenom?: string | null; email?: string | null; sigle?: string | null; code?: string | null };
const cache = new Map<string, Promise<string | null>>();

export function entityLabel(kind: Catalog, entity: Named): string | null {
    if (kind === 'users') return [entity.prenom, entity.nom].filter(Boolean).join(' ').trim() || entity.email || null;
    return entity.nom?.trim() || entity.code || null;
}

export type NameState = { name: string | null; loading: boolean };

/** Résout un nom par une clé et un chargeur ; sans chargeur (`null`), rien n'est demandé. */
function useResolved(key: string, load: (() => Promise<string | null>) | null): NameState {
    const [state, setState] = useState<NameState & { key: string }>({ key, name: null, loading: load !== null });
    useEffect(() => {
        if (!load) { setState({ key, name: null, loading: false }); return; }
        let alive = true;
        let pending = cache.get(key);
        if (!pending) {
            pending = Promise.resolve().then(load).catch(() => null);
            cache.set(key, pending);
            // Un échec n'est pas mémorisé : le prochain affichage réessaie.
            void pending.then(name => { if (name === null) cache.delete(key); });
        }
        setState(previous => previous.key === key ? previous : { key, name: null, loading: true });
        void pending.then(name => { if (alive) setState({ key, name, loading: false }); });
        return () => { alive = false; };
    }, [key, load === null]);
    return state.key === key ? { name: state.name, loading: state.loading } : { name: null, loading: load !== null };
}

export function useEntityName(kind: Catalog, id: string | null | undefined): NameState {
    const { api, epoch } = useSession();
    return useResolved(id ? `${String(epoch)}:${kind}:${id}` : '', id && api ? async () => entityLabel(kind, await api.get<Named>(kind, id)) : null);
}

/** Un document se lit par sa référence et son titre. */
export function useDocumentName(id: string | null | undefined): NameState {
    const { records, epoch } = useSession();
    return useResolved(id ? `${String(epoch)}:document:${id}` : '', id && records ? async () => { const d = await records.document(id); return [d.reference, d.title].filter(Boolean).join(' · ') || null; } : null);
}

export function DocumentName({ id, fallback }: { id: string | null | undefined; fallback?: string }) {
    const { name, loading } = useDocumentName(id);
    if (!id) return <>{fallback ?? '—'}</>;
    return <>{name ?? (loading ? '…' : fallback ?? 'Document non disponible')}</>;
}

const FALLBACK: Record<Catalog, string> = { institutions: 'Institution non disponible', departments: 'Département non disponible', users: 'Personne non disponible', roles: 'Rôle non disponible' };

/** Le nom d'une institution, d'un département, d'une personne ou d'un rôle. `fallback` : ce qui se lit quand le nom n'est pas disponible (jamais l'identifiant). */
export function EntityName({ kind, id, fallback }: { kind: Catalog; id: string | null | undefined; fallback?: string }) {
    const { name, loading } = useEntityName(kind, id);
    if (!id) return <>{fallback ?? '—'}</>;
    return <>{name ?? (loading ? '…' : fallback ?? FALLBACK[kind])}</>;
}

/** Le périmètre de travail en toutes lettres : « National », « Archives nationales » ou « Archives nationales / Service des fonds ». */
export function useScopeText(scope: Pick<ScopeTarget, 'institutionId' | 'departmentId'>): string {
    const institution = useEntityName('institutions', scope.institutionId);
    const department = useEntityName('departments', scope.departmentId);
    if (!scope.institutionId) return 'National';
    const first = institution.name ?? (institution.loading ? 'Chargement…' : 'Institution sélectionnée');
    if (!scope.departmentId) return first;
    return first + ' / ' + (department.name ?? (department.loading ? 'Chargement…' : 'département sélectionné'));
}

export function ScopeName({ scope }: { scope: Pick<ScopeTarget, 'institutionId' | 'departmentId'> }) { return <>{useScopeText(scope)}</>; }
