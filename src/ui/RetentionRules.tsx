import React, { useMemo, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { useWorkspace } from './workspace';
import { IntentKey } from '../core/validation';
import { latestVersion, ruleState, targetNames, versionSentence } from '../core/retentionRule';
import type { ClassificationNode, DocumentType, RetentionRuleListItem } from '../core/types';
import { Badge, Busy, Empty, ErrorNotice, Modal, Notice, useResource } from './components';
import { ConfigureRetentionRuleDialog } from './RetentionRuleDialog';

/** Supprimer une règle qui n'a aucune version : une tentative de création restée à moitié. Une règle qui a des versions ne se supprime jamais. */
function DeleteRuleDialog({ rule, onClose, onDone }: { rule: RetentionRuleListItem; onClose: () => void; onDone: () => void }) {
    const { retention } = useSession();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const key = useRef(new IntentKey());
    const path = `/rules/${rule.id}/delete`;
    const confirm = async () => {
        if (busy) return;
        setBusy(true); setError(null);
        try { await retention!.command(path, {}, key.current.forRequest('POST', path, {}), 'POST'); onDone(); onClose(); }
        catch (e) { setError(e); }
        finally { setBusy(false); }
    };
    return <Modal title={`Supprimer la règle ${rule.code}`} subtitle={rule.label} onClose={onClose} locked={busy}>
        <div className="panel-padding">
            <Notice tone="warning">Cette règle n’a <strong>aucune version</strong> : elle ne s’applique à aucun document. La supprimer libère son code ; l’opération est inscrite au journal d’audit.</Notice>
            {Boolean(error) && <ErrorNotice error={error} />}
        </div>
        <footer className="modal-footer"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Garder</button><button type="button" className="btn danger" disabled={busy} onClick={() => void confirm()}>{busy ? 'Suppression…' : 'Supprimer la règle'}</button></footer>
    </Modal>;
}

/**
 * Les règles de conservation : ce que chacune dit (durée, point de départ, sort final), ce qu'elle vise, où elle en est. On crée une règle, on lui donne une nouvelle version (qui remplace
 * la version en vigueur à son activation), ou on supprime une règle restée sans version.
 */
export function RetentionRulesPanel() {
    const { retention, records, classification, epoch } = useSession();
    const { scope } = useWorkspace();
    const institutionId = scope.institutionId ?? null;
    const [creating, setCreating] = useState(false);
    const [versioning, setVersioning] = useState<RetentionRuleListItem | null>(null);
    const [deleting, setDeleting] = useState<RetentionRuleListItem | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const rulesQ = useResource<RetentionRuleListItem[]>(s => retention!.rules(institutionId, s), 'retention-rules:' + institutionId + ':' + epoch);
    const typesQ = useResource<DocumentType[]>(s => records!.documentTypes(s), 'retention-rules-types:' + epoch);
    // Le plan de classement donne les noms des rubriques ; s'il ne se lit pas, on les compte sans les nommer.
    const nodesQ = useResource<ClassificationNode[]>(s => Promise.resolve().then(() => classification!.nodes(institutionId, s)).catch(() => []), 'retention-rules-nodes:' + institutionId + ':' + epoch);
    const typeNames = useMemo(() => new Map((typesQ.data ?? []).map(t => [t.id, t.label] as const)), [typesQ.data]);
    const nodeNames = useMemo(() => new Map((nodesQ.data ?? []).map(n => [n.id, (n.code ? n.code + ' — ' : '') + n.libelle] as const)), [nodesQ.data]);
    const rules = rulesQ.data ?? [];
    return <div className="panel">
        <div className="section-heading"><h3>Règles de conservation</h3><button className="btn small primary" onClick={() => { setCreating(true); setNotice(null); }}>Nouvelle règle</button></div>
        <p className="wf-note">Une règle dit combien de temps conserver, à partir de quand, et ce qu’il advient ensuite ; elle s’applique aux types de documents et aux rubriques du plan de classement qu’elle vise.</p>
        {notice && <Notice>{notice}</Notice>}
        {rulesQ.loading ? <Busy /> : rulesQ.error ? <ErrorNotice error={rulesQ.error} onRetry={rulesQ.refresh} /> : rules.length ? <div className="table-scroll"><table>
            <thead><tr><th>Règle</th><th>Ce qu’elle dit</th><th>Ce qu’elle vise</th><th>État</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rules.map(rule => {
                const v = latestVersion(rule);
                const state = ruleState(rule);
                const targets = v ? targetNames(v, typeNames, nodeNames) : null;
                return <tr key={rule.id}>
                    <td><strong>{rule.code}</strong><small className="cell-sub">{rule.label}</small><small className="cell-sub">{rule.scope === 'INSTITUTION' ? 'Institution' : 'Nationale'}</small></td>
                    <td>{v ? <>{versionSentence(v)}{v.legalReference && <small className="cell-sub">Référence légale : {v.legalReference}</small>}</> : '—'}</td>
                    <td>{targets ? <>{targets.types.length > 0 && <div><small className="cell-sub">Types de documents</small>{targets.types.join(', ')}</div>}{targets.nodes.length > 0 && <div><small className="cell-sub">Rubriques</small>{targets.nodes.join(', ')}</div>}</> : '—'}</td>
                    <td><Badge value={state.tone === 'ok' ? 'ACTIF' : state.tone === 'bad' ? 'REJETE' : state.tone === 'warn' ? 'SUSPENDU' : 'INACTIF'} label={state.tone === 'ok' ? 'En vigueur' : state.tone === 'bad' ? 'Sans version' : state.tone === 'warn' ? 'À activer' : 'Inactive'} /><small className="cell-sub">{state.text}</small>
                        {rule.versions.length > 1 && <small className="cell-sub">{rule.versions.length} versions au total</small>}</td>
                    <td className="table-actions">
                        {rule.status === 'ACTIF' && <button className="btn small secondary" onClick={() => { setVersioning(rule); setNotice(null); }}>{rule.versions.length ? 'Nouvelle version' : 'Ajouter une version'}</button>}
                        {rule.deletable && <button className="btn small danger-outline" onClick={() => { setDeleting(rule); setNotice(null); }}>Supprimer</button>}
                    </td>
                </tr>;
            })}</tbody></table></div> : <Empty title="Aucune règle de conservation" description="Créez la première règle pour que les documents clos reçoivent une échéance." icon="clock" />}
        {creating && <ConfigureRetentionRuleDialog onClose={() => setCreating(false)} onSuccess={code => { setNotice(`La règle ${code} est active.`); rulesQ.refresh(); }} />}
        {versioning && <ConfigureRetentionRuleDialog existing={versioning} onClose={() => setVersioning(null)} onSuccess={code => { setNotice(`La nouvelle version de la règle ${code} est en vigueur.`); rulesQ.refresh(); }} />}
        {deleting && <DeleteRuleDialog rule={deleting} onClose={() => setDeleting(null)} onDone={() => { setNotice(`La règle ${deleting.code} est supprimée.`); rulesQ.refresh(); }} />}
    </div>;
}
