import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCriteria, extremeYears, filterCount, foundPlace, foundState, isBlank, periodProblem, searchParams } from '../.test-build/physicalSearch.js';
import { describeBody, describeForm, describeProblems, parseQuantity } from '../.test-build/physicalDescribe.js';

// Retrouver une archive physique : ce que l'on tape devient une requête sans critère vide, et chaque résultat dit où la trouver et ce qui cloche.
const place = { unitId: 'u1', cote: 'BOITE-14', typeUnite: 'BOITE', localisation: ['Archives nationales', 'Bâtiment Kaloum', 'Salle 3', 'Rayonnage B'], actif: true };
const found = (over = {}) => ({ id: 'a1', cote: 'DP-2015-001', intitule: 'Dossier personnel Camara', description: null, support: 'Papier', etatPhysique: null, dateExtremeDebut: '2015-01-01', dateExtremeFin: '2015-12-31',
    quantite: null, uniteQuantite: null, documentId: null, institutionId: null, departmentId: null, detruite: false, habituel: place,
    actuel: { source: 'HABITUEL', unite: place, destination: null, sortiLe: null, retourPrevu: null }, ecarts: [], ...over });

test('une recherche vide ne pose aucun critère et dit que rien n’est posé', () => {
    assert.equal(isBlank(emptyCriteria()), true);
    assert.equal(filterCount(emptyCriteria()), 0);
    assert.deepEqual(searchParams(emptyCriteria(), 0, 20), { q: undefined, locationId: undefined, support: undefined, etatPhysique: undefined, institutionId: undefined, departmentId: undefined,
        from: undefined, to: undefined, out: undefined, linked: undefined, includeDestroyed: undefined, page: undefined, size: 20 });
});

test('les critères posés partent au serveur, sans espaces autour, avec oui et non en vrai et faux', () => {
    const c = { ...emptyCriteria(), q: '  camara  ', locationId: 'l1', support: ' Papier ', out: 'oui', linked: 'non', from: '2015-01-01', includeDestroyed: true };
    const p = searchParams(c, 2, 20);
    assert.equal(p.q, 'camara'); assert.equal(p.locationId, 'l1'); assert.equal(p.support, 'Papier');
    assert.equal(p.out, 'true'); assert.equal(p.linked, 'false'); assert.equal(p.from, '2015-01-01'); assert.equal(p.includeDestroyed, 'true');
    assert.equal(p.page, 2); assert.equal(p.size, 20);
    assert.equal(isBlank(c), false);
    assert.equal(filterCount(c), 6, 'lieu, support, début de période, sortie, document, et les détruites : six filtres cachés');
});

test('une période inversée est signalée avant d’être envoyée', () => {
    assert.equal(periodProblem({ from: '2019-01-01', to: '2018-01-01' }), 'La date de fin de la période doit suivre sa date de début.');
    assert.equal(periodProblem({ from: '2019-01-01', to: '2019-01-01' }), null);
    assert.equal(periodProblem({ from: '', to: '2018-01-01' }), null);
});

test('les années extrêmes se lisent comme sur une étiquette', () => {
    assert.equal(extremeYears(found()), '2015');
    assert.equal(extremeYears(found({ dateExtremeFin: '2017-06-30' })), '2015 – 2017');
    assert.equal(extremeYears(found({ dateExtremeFin: null })), '2015');
    assert.equal(extremeYears(found({ dateExtremeDebut: null, dateExtremeFin: null })), '—');
});

test('le lieu est le chemin complet puis la cote de l’unité', () => {
    assert.equal(foundPlace(found()), 'Archives nationales › Bâtiment Kaloum › Salle 3 › Rayonnage B · BOITE-14');
});

test('une archive à sa place ne dit rien de plus ; sinon l’état dit pourquoi aller voir', () => {
    assert.equal(foundState(found()), null);
    const out = foundState(found({ actuel: { source: 'EN_SORTIE', unite: null, destination: null, sortiLe: '2026-10-03T08:00:00Z', retourPrevu: '2026-10-10T08:00:00Z' } }));
    assert.equal(out.badge, 'SORTIE'); assert.equal(out.tone, ''); assert.match(out.detail, /Sortie le .* retour prévu le /);
    const late = foundState(found({ ecarts: ['SORTIE_EN_RETARD'], actuel: { source: 'EN_SORTIE', unite: null, destination: null, sortiLe: null, retourPrevu: '2026-10-10T08:00:00Z' } }));
    assert.equal(late.badge, 'SORTIE_EN_RETARD'); assert.equal(late.tone, 'warn');
    assert.equal(foundState(found({ actuel: { source: 'INTROUVABLE', unite: null, destination: null, sortiLe: null, retourPrevu: null } })).badge, 'INTROUVABLE');
    const elsewhere = foundState(found({ actuel: { source: 'CONSTATE_AILLEURS', unite: { ...place, cote: 'BOITE-99', localisation: ['Salle 4'] }, destination: null, sortiLe: null, retourPrevu: null } }));
    assert.equal(elsewhere.badge, 'AUTRE_EMPLACEMENT'); assert.match(elsewhere.detail, /Salle 4 · BOITE-99/);
    assert.equal(foundState(found({ detruite: true })).badge, 'DETRUITE');
});

test('corriger une description : le formulaire part de l’archive, une quantité se lit avec une virgule', () => {
    const archive = { id: 'a1', intitule: null, support: 'Papier', etatPhysique: null, description: 'Registre', dateExtremeDebut: '2015-01-01', dateExtremeFin: null, quantite: '12.000', uniteQuantite: 'boîtes', versionLock: 4 };
    const form = describeForm(archive);
    assert.deepEqual(form, { intitule: '', support: 'Papier', etatPhysique: '', description: 'Registre', dateExtremeDebut: '2015-01-01', dateExtremeFin: '', quantite: '12', uniteQuantite: 'boîtes' });
    assert.equal(describeForm({ ...archive, quantite: null }).quantite, '', 'pas de quantité : champ vide'); assert.equal(describeForm({ ...archive, quantite: undefined }).quantite, '');
    assert.equal(parseQuantity('0,5'), 0.5); assert.equal(parseQuantity('12'), 12); assert.equal(parseQuantity(' '), null);
    assert.ok(Number.isNaN(parseQuantity('douze'))); assert.ok(Number.isNaN(parseQuantity('-3'))); assert.ok(Number.isNaN(parseQuantity('1,2345')));
    const body = describeBody({ ...form, intitule: '  Registre des mariages ', quantite: '0,5', dateExtremeFin: '' }, 4);
    assert.deepEqual(body, { versionLock: 4, intitule: 'Registre des mariages', support: 'Papier', etatPhysique: null, description: 'Registre', dateExtremeDebut: '2015-01-01', dateExtremeFin: null, quantite: 0.5, uniteQuantite: 'boîtes' });
});

test('ce qui empêche d’enregistrer une description est dit en phrases', () => {
    const ok = { intitule: '', support: '', etatPhysique: '', description: '', dateExtremeDebut: '', dateExtremeFin: '', quantite: '', uniteQuantite: '' };
    assert.deepEqual(describeProblems(ok), []);
    assert.deepEqual(describeProblems({ ...ok, dateExtremeDebut: '2020-01-01', dateExtremeFin: '2019-01-01' }), ['La date extrême de fin doit suivre la date extrême de début.']);
    assert.deepEqual(describeProblems({ ...ok, quantite: 'beaucoup' }), ['La quantité est un nombre positif, avec au plus trois décimales.']);
    assert.deepEqual(describeProblems({ ...ok, uniteQuantite: 'boîtes' }), ['Indiquez la quantité, ou retirez son unité.']);
});
