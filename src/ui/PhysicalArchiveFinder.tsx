import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Busy, Empty, ErrorNotice, Field, Pagination, useResource } from './components';
import { OriginFields, OriginText } from './Origin';
import { display } from '../core/format';
import type { PageResult } from '../core/paging';
import { emptyCriteria, extremeYears, filterCount, foundPlace, foundState, isBlank, periodProblem } from '../core/physicalSearch';
import type { ArchiveFound, ArchiveSearchCriteria } from '../core/physicalSearch';
import { locationPath } from '../core/placement';
import { parsePhysicalCode } from '../core/physicalLabels';
import type { Localisation } from '../core/types';

/** La pause, en millisecondes, après la dernière touche, avant de lancer la recherche : on trouve en tapant, sans chercher un bouton. */
const TYPING_PAUSE = 350;

const YES_NO = [['', 'Peu importe'], ['oui', 'Oui'], ['non', 'Non']] as const;

/**
 * Retrouver une archive physique (un dossier papier, une boîte) par ce que l'on en sait : un mot de son titre, un bout de cote, le lieu (« salle 3 »), le service qui l'a produite.
 * Chaque résultat dit où la trouver, chemin complet compris, et prévient si elle est sortie, introuvable ou rangée ailleurs.
 */
export function PhysicalArchiveFinder({ locations, onOpen }: { locations: readonly Localisation[]; onOpen: (found: { id: string; habituel: { unitId: string } }) => void }) {
    const { physicalArchives, epoch } = useSession();
    const [form, setForm] = useState<ArchiveSearchCriteria>(emptyCriteria);
    const [applied, setApplied] = useState<ArchiveSearchCriteria>(emptyCriteria);
    const [page, setPage] = useState(0);
    const [refining, setRefining] = useState(false);
    const [scanError, setScanError] = useState<unknown>(null);
    const typed = useRef('');
    const problem = periodProblem(form);
    const change = (patch: Partial<ArchiveSearchCriteria>) => setForm(current => ({ ...current, ...patch }));
    // un filtre s'applique tout de suite, le texte après une courte pause ; une période inversée attend d'être corrigée
    useEffect(() => {
        if (problem) return;
        const timer = setTimeout(() => { typed.current = form.q; setApplied(form); setPage(0); }, form.q !== typed.current ? TYPING_PAUSE : 0);
        return () => clearTimeout(timer);
    }, [form, problem]);
    const places = useMemo(() => {
        const byId = new Map(locations.map(l => [l.id, l] as const));
        return locations.map(l => ({ id: l.id, label: locationPath(l.id, byId).join(' › ') })).sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    }, [locations]);
    const q = useResource<PageResult<ArchiveFound>>(s => physicalArchives!.findArchives(applied, page, s), JSON.stringify(['archive-find', applied, page, epoch]));
    const items = q.data?.items ?? [];
    const filters = filterCount(form);
    /** Une douchette tape le code du QR puis Entrée : le code d'une archive ouvre sa fiche ; tout autre texte est une recherche. */
    const submit = async () => {
        setScanError(null);
        const code = parsePhysicalCode(form.q);
        if (code?.kind === 'ARCHIVE') {
            try {
                const archive = await physicalArchives!.archive(code.id);
                setForm(current => ({ ...current, q: '' }));
                onOpen({ id: archive.id, habituel: { unitId: archive.uniteStockageId } });
            } catch (e) { setScanError(e); }
            return;
        }
        if (!problem) { typed.current = form.q; setApplied(form); setPage(0); }
    };
    const reset = () => { typed.current = ''; setForm(emptyCriteria()); setApplied(emptyCriteria()); setPage(0); };
    return <div className="panel" role="search" aria-label="Retrouver une archive physique">
        <div className="section-heading"><h3>Retrouver une archive</h3></div>
        <p className="wf-note">Tapez ce que vous savez : un mot du titre, un bout de cote, le lieu (« salle 3 »), le service qui l’a produite. Les accents et les majuscules ne comptent pas, et chaque mot doit se retrouver quelque part.</p>
        <form className="asset-filters" onSubmit={e => { e.preventDefault(); void submit(); }}>
            <Field label="Rechercher"><input type="search" value={form.q} onChange={e => change({ q: e.target.value })} placeholder="Cote, titre, lieu, service producteur…" maxLength={300} /></Field>
            <button type="button" className="btn small secondary" aria-expanded={refining} onClick={() => setRefining(r => !r)}>{refining ? 'Masquer les filtres' : filters ? 'Affiner (' + filters + ')' : 'Affiner'}</button>
            {(filters > 0 || form.q.trim() !== '') && <button type="button" className="btn small secondary" onClick={reset}>Tout effacer</button>}
        </form>
        {refining && <div className="form-grid finder-filters">
            <Field label="Lieu" hint="Tout ce que ce lieu contient, sous-lieux compris."><select value={form.locationId} onChange={e => change({ locationId: e.target.value })}><option value="">Partout</option>{places.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
            <Field label="Support"><input value={form.support} onChange={e => change({ support: e.target.value })} placeholder="Papier, parchemin…" maxLength={80} /></Field>
            <Field label="État physique"><input value={form.etatPhysique} onChange={e => change({ etatPhysique: e.target.value })} maxLength={40} /></Field>
            <OriginFields institutionId={form.institutionId} departmentId={form.departmentId} onChange={(institutionId, departmentId) => change({ institutionId, departmentId })} institutionLabel="Institution productrice" unitLabel="Direction ou service producteur" hint="Les archives produites par cette institution." />
            <Field label="Dates extrêmes : à partir du"><input type="date" value={form.from} onChange={e => change({ from: e.target.value })} /></Field>
            <Field label="Dates extrêmes : jusqu’au" error={problem ?? undefined}><input type="date" value={form.to} onChange={e => change({ to: e.target.value })} /></Field>
            <Field label="Sortie de réserve"><select value={form.out} onChange={e => change({ out: e.target.value as ArchiveSearchCriteria['out'] })}>{YES_NO.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Document numérique relié"><select value={form.linked} onChange={e => change({ linked: e.target.value as ArchiveSearchCriteria['linked'] })}>{YES_NO.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <label className="field checkbox-field"><input type="checkbox" checked={form.includeDestroyed} onChange={e => change({ includeDestroyed: e.target.checked })} /> <span>Inclure les archives détruites</span></label>
        </div>}
        {scanError ? <ErrorNotice error={scanError} /> : null}
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : items.length ? <>
            <div className="table-scroll"><table><thead><tr><th>Cote et intitulé</th><th>Où la trouver</th><th>Dates</th><th>Origine</th></tr></thead>
                <tbody>{items.map(a => {
                    const state = foundState(a);
                    return <tr key={a.id}>
                        <td><button type="button" className="text-link" onClick={() => onOpen(a)}>{a.cote}</button>
                            <small className="cell-sub">{a.intitule || <em>Sans intitulé</em>}</small>
                            {a.support && <small className="cell-sub">{display(a.support)}</small>}</td>
                        <td>{foundPlace(a)}{state && <small className="cell-sub"><Badge value={state.badge} label={state.label} /> {state.detail}</small>}</td>
                        <td className="nowrap">{extremeYears(a)}</td>
                        <td><OriginText institutionId={a.institutionId} departmentId={a.departmentId} /></td>
                    </tr>;
                })}</tbody></table></div>
            <Pagination page={page} hasMore={q.data?.hasMore ?? false} onChange={setPage} count={items.length} />
        </> : <Empty title="Aucune archive trouvée" description={isBlank(applied) ? 'Aucune archive physique n’est encore enregistrée.' : 'Essayez avec moins de mots, ou retirez un filtre. Un lieu se cherche par son nom (« salle 3 »), une cote par un morceau.'} />}
    </div>;
}
