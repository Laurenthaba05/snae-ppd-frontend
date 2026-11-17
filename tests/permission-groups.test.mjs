import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMAIN_LABELS, attributionText, catalogSummary, domainLabel, groupByDomain, onlyUnassigned } from '../.test-build/permissionGroups.js';

// Le catalogue des permissions se range par domaine ; chaque permission dit quels rôles la détiennent.
const role = (code, name = code, status = 'ACTIF') => ({ id: 'r-' + code, code, name, scope: 'NATIONAL', status });
const perm = (code, domain, roles = []) => ({ id: 'p-' + code, code, description: null, domain, roles });

const items = [
    perm('DOCUMENT_READ', 'RECORDS', [role('LECTEUR'), role('ARCHIVISTE')]),
    perm('DOCUMENT_CREATE', 'RECORDS', [role('ARCHIVISTE')]),
    perm('HERITAGE_READ', 'HERITAGE', []),
    perm('AUDIT_READ', 'AUDIT', [role('CONTROLEUR')]),
    perm('NOUVEAU_DROIT', 'DOMAINE_INCONNU', [])
];

test('les permissions sont rangées par domaine, les domaines par nom lisible et les permissions par code', () => {
    const groups = groupByDomain(items);
    assert.deepEqual(groups.map(g => g.domain), ['AUDIT', 'DOMAINE_INCONNU', 'HERITAGE', 'RECORDS'].sort((a, b) => domainLabel(a).localeCompare(domainLabel(b), 'fr')));
    const records = groups.find(g => g.domain === 'RECORDS');
    assert.deepEqual(records.permissions.map(p => p.code), ['DOCUMENT_CREATE', 'DOCUMENT_READ']);
    assert.equal(records.label, 'Documents et dossiers');
});

test('un groupe compte les permissions qu’aucun rôle ne détient', () => {
    const groups = groupByDomain(items);
    assert.equal(groups.find(g => g.domain === 'RECORDS').unassigned, 0);
    assert.equal(groups.find(g => g.domain === 'HERITAGE').unassigned, 1);
    assert.deepEqual(catalogSummary(groups), { permissions: 5, domains: 4, unassigned: 2 });
});

test('un domaine inconnu s’affiche avec son code mis en forme, jamais caché ni laissé brut', () => {
    assert.equal(domainLabel('DOMAINE_INCONNU'), 'Domaine inconnu');
    assert.equal(domainLabel('PHYSICALARCHIVES'), 'Archives physiques');
    for (const label of Object.values(DOMAIN_LABELS)) assert.ok(!/^[A-Z_]+$/.test(label), label);
});

test('le filtre « sans rôle » ne garde que les permissions sans attribution', () => {
    assert.deepEqual(onlyUnassigned(items).map(p => p.code), ['HERITAGE_READ', 'NOUVEAU_DROIT']);
    assert.deepEqual(groupByDomain(onlyUnassigned(items)).map(g => g.unassigned), groupByDomain(onlyUnassigned(items)).map(g => g.permissions.length));
});

test('le texte de l’attribution dit le nombre de rôles', () => {
    assert.equal(attributionText([]), 'Aucun rôle');
    assert.equal(attributionText([role('A')]), '1 rôle');
    assert.equal(attributionText([role('A'), role('B'), role('C')]), '3 rôles');
});

test('un catalogue vide ne donne ni groupe ni chiffre inventé', () => {
    assert.deepEqual(groupByDomain([]), []);
    assert.deepEqual(catalogSummary([]), { permissions: 0, domains: 0, unassigned: 0 });
});

test('le rangement ne modifie pas ce qu’il reçoit', () => {
    const copy = JSON.stringify(items);
    groupByDomain(items);
    assert.equal(JSON.stringify(items), copy);
});
