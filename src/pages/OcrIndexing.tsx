import { pageSummary } from '../core/i18n';
import { useLocale } from '../ui/i18n';
import { ResourceDetailsButton } from '../ui/ResourceDetails';
import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { can } from '../core/policy';
import { navigate } from '../ui/navigation';
import { Badge, Busy, Empty, ErrorNotice, PageHead, Pagination, formatDate, useResource } from '../ui/components';
import { Icon } from '../ui/icons';
import { OcrLayoutDialog } from '../ui/OcrLayoutDialog';
import { saveBlob } from '../ui/ReadingRoomParts';
import { OcrIndexingPolicyPanel } from '../ui/OcrIndexingPolicyPanel';
import { indexationLabel } from '../core/ocrIndexing';
import { RELIABILITY_MEANING, preparationLabel, reliabilityCounts, reliabilityLabel, reliabilityReasons } from '../core/textReliability';
import type { OcrListItem, Page } from '../core/types';

/** La fiabilité du texte sous la barre de confiance : un mot (jamais la couleur seule), la préparation d'image éventuelle et, à la demande, les raisons. */
export function ReliabilityBadge({ item }: { item: Pick<OcrListItem, 'fiabilite' | 'preparation'> }) {
    const level = item.fiabilite?.level;
    if (!level) return null;
    const reasons = reliabilityReasons(item);
    const preparation = preparationLabel(item.preparation);
    return <div className="ocr-reliability">
        <span className={'rel-pill rel-' + level.toLowerCase().replace('_', '-')} title={RELIABILITY_MEANING[level] ?? ''}>{reliabilityLabel(level)}</span>
        {preparation && <small className="cell-sub">{preparation}</small>}
        {reasons.length > 0 && <details className="rel-reasons"><summary>Pourquoi ?</summary><ul>{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></details>}
    </div>;
}

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
    const { locale, tr } = useLocale();
    const canManage = can(me, 'DIGITIZATION_MANAGE', {});
    const [layoutItem, setLayoutItem] = useState<OcrListItem | null>(null);
    const [filter, setFilter] = useState('');
    const [status, setStatus] = useState<'' | 'NON_VALIDE' | 'VALIDE'>('');
    const [lowOnly, setLowOnly] = useState(false);
    const [page, setPage] = useState(0);
    const q = useResource<Page<OcrListItem>>(s => digitization!.ocrResults({ page, size: 50, q: filter, status, lowConfidence: lowOnly }, s), JSON.stringify(['ocr-all', epoch, page, filter, status, lowOnly]));
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<unknown>(null);
    const items = q.data?.items ?? [];
    const low = (i: OcrListItem) => { const c = confidenceOf(i); return c !== null && c < OCR_CONFIDENCE_THRESHOLD; };
    const rows = items;
    const toCheck = items.filter(i => i.statutValidation === 'NON_VALIDE').length;
    const counts = reliabilityCounts(items);
    const evaluated = items.length - counts.nonEvalue;
    const confidences = items.map(confidenceOf).filter((c): c is number => c !== null);
    const average = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;
    const validate = async (item: OcrListItem) => {
        setBusy(item.id); setError(null);
        try { await digitization!.command(`/ocr-results/${item.id}/validate`, {}, crypto.randomUUID(), 'POST'); q.refresh(); }
        catch (e) { setError(e); } finally { setBusy(null); }
    };
    const exportAlto = async (item: OcrListItem) => {
        if ((item.layoutPages?.length ?? 0) > 1) { setLayoutItem(item); return; }
        const page = item.layoutPages?.[0] ?? item.numeroPage ?? 1;
        setBusy(item.id); setError(null);
        try { saveBlob(await digitization!.ocrAlto(item.id, undefined, page), 'alto-' + item.fichierNom.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '-') + '-page-' + page + '.xml'); }
        catch (e) { setError(e); } finally { setBusy(null); }
    };
    const open = (item: OcrListItem) => item.projetId && item.elementId
        ? navigate('/app/numerisation?project=' + encodeURIComponent(item.projetId) + '&element=' + encodeURIComponent(item.elementId))
        : navigate('/app/documents/' + item.documentId);
    return <><PageHead eyebrow="MODULE · NUMÉRISATION" title="OCR et indexation" description="Textes extraits des fichiers numérisés : confiance de la reconnaissance et vérification. Un texte validé alimente la recherche plein texte ; selon la politique de l’institution, un texte jugé fiable aussi, signalé « non vérifié »." />
        <OcrIndexingPolicyPanel />
        <div className="panel">
                <div className="table-toolbar"><div className="input-icon search-box"><Icon name="search" /><input aria-label="Filtrer les résultats OCR" placeholder="Fichier, document, projet, moteur…" value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }} /></div>
                    <div className="toolbar-right"><select aria-label="État de vérification" value={status} onChange={e => { setStatus(e.target.value as '' | 'NON_VALIDE' | 'VALIDE'); setPage(0); }}><option value="">Tous les états</option><option value="NON_VALIDE">À vérifier</option><option value="VALIDE">Validés</option></select>
                        <label className="scan-toggle"><input type="checkbox" checked={lowOnly} onChange={e => { setLowOnly(e.target.checked); setPage(0); }} />Sous le seuil</label>
                        <button className="icon-btn" aria-label="Actualiser la liste" onClick={q.refresh}><Icon name="refresh" size={18} /></button></div></div>
            {q.loading ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} /> : <>
                <ul className="scan-chips ocr-chips">
                    <li>{pageSummary(locale, items.length, page + 1)}</li>
                    <li className={toCheck ? 'warn' : 'ok'}>{toCheck} à vérifier</li>
                    <li className="ok">{items.length - toCheck} {tr(items.length - toCheck > 1 ? 'Validés' : 'Validé')}</li>
                    <li>Confiance moyenne : {average === null ? '—' : Math.round(average * 100) + ' %'}</li>
                    <li className={items.filter(low).length ? 'warn' : 'ok'}>{items.filter(low).length} sous le seuil de {Math.round(OCR_CONFIDENCE_THRESHOLD * 100)} %</li>
                    {evaluated > 0 && <li className={counts.nonFiable ? 'warn' : 'ok'}>Fiabilité du texte — fiables : {counts.fiable} · à vérifier : {counts.aVerifier} · non fiables : {counts.nonFiable}</li>}
                </ul>
                {error ? <ErrorNotice error={error} /> : null}
                {rows.length ? <div className="table-scroll"><table>
                    <thead><tr><th>Fichier</th><th>Projet · élément</th><th>Moteur</th><th>Langue</th><th>Page</th><th>Confiance</th><th>Vérification</th><th>Date</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{rows.map(i => { const c = confidenceOf(i); return <tr key={i.id}>
                        <td><strong>{i.fichierNom}</strong><small className="cell-sub">{i.documentReference} · {i.documentTitre}</small></td>
                        <td>{i.projetNom ? <>{i.projetNom}<small className="cell-sub">{i.elementDescription || '—'}</small></> : <span className="cell-sub">Hors projet</span>}</td>
                        <td>{i.moteur ?? i.typeReconnaissance}<small className="cell-sub">{i.moteur ? i.typeReconnaissance : ''}</small></td><td>{i.langue ?? '—'}</td><td>{i.layoutPages?.length ? i.layoutPages.join(', ') : i.numeroPage ?? '—'}</td>
                        <td>{c === null ? '—' : <span className={'ocr-conf ' + (c < OCR_CONFIDENCE_THRESHOLD ? 'low' : 'ok')} title={Math.round(c * 1000) / 10 + ' %'}><i style={{ width: Math.round(c * 100) + '%' }} /><b>{Math.round(c * 100)} %</b></span>}<ReliabilityBadge item={i} /></td>
                        <td><Badge value={i.statutValidation} />{indexationLabel(i) && <small className={'cell-sub idx-' + (i.indexation ?? '').toLowerCase()}>{indexationLabel(i)}</small>}</td><td>{formatDate(i.createdAt)}</td>
                        <td><div className="table-actions"><ResourceDetailsButton resource="ocrResult" id={i.id} title={i.fichierNom} label="Lire le texte" />{canManage && i.statutValidation === 'NON_VALIDE' && <button className="btn small primary" disabled={busy === i.id} onClick={() => void validate(i)}>Valider</button>}{i.hasLayout && <button className="btn small secondary" onClick={() => setLayoutItem(i)}>Positions</button>}{i.hasLayout && <button className="btn small secondary" disabled={busy === i.id} onClick={() => void exportAlto(i)} title="Le texte avec la position de chaque mot (ALTO)">ALTO</button>}<button className="btn small secondary" onClick={() => open(i)}>Ouvrir</button></div></td></tr>; })}</tbody></table></div>
                    : <Empty title={filter || status || lowOnly ? 'Aucun résultat pour ces filtres' : 'Aucun résultat OCR'} description={filter || status || lowOnly ? 'Modifiez le filtre ou l’état de vérification.' : 'Les textes extraits des fichiers numérisés apparaîtront ici dès qu’un résultat OCR est enregistré sur un fichier.'} />}
                <Pagination page={page} hasMore={q.data?.hasMore ?? false} count={items.length} onChange={setPage} />
            </>}
        </div>
        {layoutItem && <OcrLayoutDialog resultId={layoutItem.id} fileName={layoutItem.fichierNom} pageNumber={layoutItem.numeroPage} layoutPages={layoutItem.layoutPages} onClose={() => setLayoutItem(null)} />}
        <p className="page-note"><Icon name="shield"  size={15} />La lecture des positions et du texte reste soumise aux droits d’accès et à la confidentialité de chaque document. Les documents confidentiels ou sous restriction n’apparaissent pas.</p>
        <p className="page-note"><Icon name="info" size={15} />La confiance est un score du moteur : elle ne dit pas si le texte est juste. La fiabilité la croise avec la sûreté de chaque mot, la préparation éventuelle de l’image et la qualité de la page. « Fiable » veut dire que rien ne l’inquiète ; elle est calibrée sur des pages de test et reste à étalonner sur vos scans.</p></>;
}
