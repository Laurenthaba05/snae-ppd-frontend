import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { navigate } from '../ui/navigation';
import { Badge, Busy, Empty, ErrorNotice, PageHead, formatDate, useResource } from '../ui/components';
import { Icon } from '../ui/icons';
import type { OcrListItem } from '../core/types';

/** Seuil de confiance minimal des règles métier du traitement (« Confiance ≥ 80 % »). */
export const OCR_CONFIDENCE_THRESHOLD = 0.8;
export const confidenceOf = (item: Pick<OcrListItem, 'confiance'>): number | null => {
    if (item.confiance === null || item.confiance === undefined) return null;
    const value = Number(item.confiance);
    return Number.isFinite(value) ? value : null;
};

/**
 * OCR et indexation : tous les textes extraits, leur confiance et leur état de vérification.
 * Seul le texte validé par une personne est transmis à l'index de la recherche plein texte.
 */
export function OcrListPage() {
    const { me, digitization, epoch } = useSession();
    const canManage = can(me, 'DIGITIZATION_MANAGE', {});
    const q = useResource<OcrListItem[]>(s => digitization!.ocrResults(s), 'ocr-all:' + epoch);
    const [filter, setFilter] = useState('');
    const [status, setStatus] = useState<'' | 'NON_VALIDE' | 'VALIDE'>('');
    const [lowOnly, setLowOnly] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<unknown>(null);
    const items = q.data ?? [];
    const low = (i: OcrListItem) => { const c = confidenceOf(i); return c !== null && c < OCR_CONFIDENCE_THRESHOLD; };
    const rows = items.filter(i => (!status || i.statutValidation === status) && (!lowOnly || low(i))
        && JSON.stringify([i.fichierNom, i.documentTitre, i.documentReference, i.projetNom, i.elementDescription, i.moteur]).toLowerCase().includes(filter.toLowerCase()));
    const toCheck = items.filter(i => i.statutValidation === 'NON_VALIDE').length;
    const confidences = items.map(confidenceOf).filter((c): c is number => c !== null);
    const average = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;
    const validate = async (item: OcrListItem) => {
        setBusy(item.id); setError(null);
        try { await digitization!.command(`/ocr-results/${item.id}/validate`, {}, crypto.randomUUID(), 'POST'); q.refresh(); }
        catch (e) { setError(e); } finally { setBusy(null); }
    };
    const open = (item: OcrListItem) => item.projetId && item.elementId
        ? navigate('/app/numerisation?project=' + encodeURIComponent(item.projetId) + '&element=' + encodeURIComponent(item.elementId))
        : navigate('/app/documents/' + item.documentId);
    return <><PageHead eyebrow="MODULE · NUMÉRISATION" title="OCR et indexation" description="Textes extraits des fichiers numérisés : confiance de la reconnaissance et vérification. Seul un texte validé alimente la recherche plein texte." />
        <div className="panel">
            {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : <>
                <ul className="scan-chips ocr-chips">
                    <li>{items.length} résultat{items.length > 1 ? 's' : ''}</li>
                    <li className={toCheck ? 'warn' : 'ok'}>{toCheck} à vérifier</li>
                    <li className="ok">{items.length - toCheck} validé{items.length - toCheck > 1 ? 's' : ''} · indexé{items.length - toCheck > 1 ? 's' : ''}</li>
                    <li>Confiance moyenne : {average === null ? '—' : Math.round(average * 100) + ' %'}</li>
                    <li className={items.filter(low).length ? 'warn' : 'ok'}>{items.filter(low).length} sous le seuil de {Math.round(OCR_CONFIDENCE_THRESHOLD * 100)} %</li>
                </ul>
                <div className="table-toolbar"><div className="input-icon search-box"><Icon name="search" /><input aria-label="Filtrer les résultats OCR" placeholder="Fichier, document, projet, moteur…" value={filter} onChange={e => setFilter(e.target.value)} /></div>
                    <div className="toolbar-right"><select aria-label="État de vérification" value={status} onChange={e => setStatus(e.target.value as '' | 'NON_VALIDE' | 'VALIDE')}><option value="">Tous les états</option><option value="NON_VALIDE">À vérifier</option><option value="VALIDE">Validés</option></select>
                        <label className="scan-toggle"><input type="checkbox" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} />Sous le seuil</label>
                        <button className="icon-btn" aria-label="Actualiser la liste" onClick={q.refresh}><Icon name="refresh" size={18} /></button></div></div>
                {error ? <ErrorNotice error={error} /> : null}
                {rows.length ? <div className="table-scroll"><table>
                    <thead><tr><th>Fichier</th><th>Projet · élément</th><th>Moteur</th><th>Langue</th><th>Page</th><th>Confiance</th><th>Vérification</th><th>Date</th><th /></tr></thead>
                    <tbody>{rows.map(i => { const c = confidenceOf(i); return <tr key={i.id}>
                        <td><strong>{i.fichierNom}</strong><small className="cell-sub">{i.documentReference} · {i.documentTitre}</small></td>
                        <td>{i.projetNom ? <>{i.projetNom}<small className="cell-sub">{i.elementDescription || '—'}</small></> : <span className="cell-sub">Hors projet</span>}</td>
                        <td>{i.moteur ?? i.typeReconnaissance}<small className="cell-sub">{i.moteur ? i.typeReconnaissance : ''}</small></td><td>{i.langue ?? '—'}</td><td>{i.numeroPage ?? '—'}</td>
                        <td>{c === null ? '—' : <span className={'ocr-conf ' + (c < OCR_CONFIDENCE_THRESHOLD ? 'low' : 'ok')} title={Math.round(c * 1000) / 10 + ' %'}><i style={{ width: Math.round(c * 100) + '%' }} /><b>{Math.round(c * 100)} %</b></span>}</td>
                        <td><Badge value={i.statutValidation} /></td><td>{formatDate(i.createdAt)}</td>
                        <td><div className="table-actions">{canManage && i.statutValidation === 'NON_VALIDE' && <button className="btn small primary" disabled={busy === i.id} onClick={() => void validate(i)}>Valider</button>}<button className="btn small secondary" onClick={() => open(i)}>Ouvrir</button></div></td></tr>; })}</tbody></table></div>
                    : <Empty title={items.length ? 'Aucun résultat pour ces filtres' : 'Aucun résultat OCR'} description={items.length ? 'Modifiez le filtre ou l’état de vérification.' : 'Les textes extraits des fichiers numérisés apparaîtront ici dès qu’un résultat OCR est enregistré sur un fichier.'} />}
            </>}
        </div>
        <p className="page-note"><Icon name="shield" size={15} />Le texte n’est jamais affiché ici : il reste soumis aux droits d’accès et à la confidentialité de chaque document. Les documents confidentiels ou sous restriction n’apparaissent pas.</p></>;
}
