import test from 'node:test';
import assert from 'node:assert/strict';
import { FICHE_GROUPS, FICHE_STATUS_LABELS, emptyFicheForm, ficheBody, ficheCompleteness, ficheDisplay, ficheFormOf, ficheMaxLength, ficheProblems } from '../.test-build/institutionFiche.js';

const view = (extra = {}) => ({ input: { institutionId: 'i1', adresse: 'Conakry', telephone: null, courriel: 'archives@exemple.gn', siteWeb: null, horaires: null, accessibilite: null, services: null, histoire: null, mandat: null, politiqueAcquisition: null, tutelleInstitutionId: null, version: 2, ...extra }, code: 'AN', nom: 'Archives nationales', sigle: 'AN', tutelleNom: null, version: 2, updatedAt: '2026-10-09T00:00:00Z' });

test('La fiche suit les zones ISDIAH : identification, contact, description, accès et services, contrôle', () => {
    assert.deepEqual(FICHE_GROUPS.map(g => g.title), ['Identification', 'Contact', 'Description du service', 'Accès et services', 'Contrôle de la fiche']);
    assert.deepEqual(FICHE_GROUPS.flatMap(g => g.fields.map(f => f.key)), [
        'identifiantService', 'codePays', 'formesParalleles', 'autresFormes',
        'adresse', 'telephone', 'courriel', 'siteWeb',
        'histoire', 'contexteGeoculturel', 'mandat', 'structure', 'politiqueAcquisition', 'batiments', 'fondsDetenus', 'instrumentsRecherche',
        'horaires', 'conditionsAcces', 'accessibilite', 'services', 'reproduction', 'espacesPublics',
        'statut', 'niveauDetail', 'regles', 'langues', 'ecritures', 'sources', 'notesMaintenance']);
});

test('Une fiche absente donne un formulaire vide, une fiche existante se relit sans null', () => {
    assert.deepEqual(ficheFormOf(null), emptyFicheForm());
    const form = ficheFormOf(view({ tutelleInstitutionId: 't1' }));
    assert.equal(form.adresse, 'Conakry'); assert.equal(form.telephone, ''); assert.equal(form.tutelleInstitutionId, 't1');
});

test('Les coordonnées mal formées sont signalées avec leur champ', () => {
    assert.deepEqual(ficheProblems(emptyFicheForm()), []);
    assert.match(ficheProblems({ ...emptyFicheForm(), telephone: 'abc' })[0], /^Téléphone/);
    assert.match(ficheProblems({ ...emptyFicheForm(), courriel: 'nope' })[0], /^Courriel/);
    assert.match(ficheProblems({ ...emptyFicheForm(), siteWeb: 'ftp://x.gn' })[0], /^Site web/);
    assert.match(ficheProblems({ ...emptyFicheForm(), histoire: 'x'.repeat(10001) })[0], /^Histoire du service/);
    assert.deepEqual(ficheProblems({ ...emptyFicheForm(), telephone: '+224 622 00 00 00', courriel: 'a@b.gn', siteWeb: 'https://archives.gov.gn' }), []);
});

test('Le corps envoyé rend absentes les zones vides et rogne les coordonnées', () => {
    const body = ficheBody('i1', { ...emptyFicheForm(), adresse: 'Conakry', telephone: ' +224 62 ', courriel: ' a@b.gn ', horaires: '   ', tutelleInstitutionId: '' }, 3);
    const absent = Object.fromEntries(FICHE_GROUPS.flatMap(g => g.fields.map(f => [f.key, null])));
    assert.deepEqual(body, { ...absent, institutionId: 'i1', adresse: 'Conakry', telephone: '+224 62', courriel: 'a@b.gn', tutelleInstitutionId: null, version: 3 });
    assert.equal(ficheBody('i1', { ...emptyFicheForm(), tutelleInstitutionId: 't9' }, 0).tutelleInstitutionId, 't9');
});

test('L’avancement de la fiche compte les zones renseignées et la tutelle', () => {
    assert.deepEqual(ficheCompleteness(null), { done: 0, total: 30 });
    assert.deepEqual(ficheCompleteness(view()), { done: 2, total: 30 });
    assert.deepEqual(ficheCompleteness(view({ tutelleInstitutionId: 't1', histoire: 'x' })), { done: 4, total: 30 });
});

test('Les zones de contrôle sont envoyées à la forme normale et contrôlées', () => {
    const body = ficheBody('i1', { ...emptyFicheForm(), statut: 'A_RELIRE', niveauDetail: 'PARTIEL', langues: ' fr+ff ', ecritures: ' Latn ', formesParalleles: 'National Archives', structure: ' ' }, 1);
    assert.equal(body.statut, 'A_RELIRE'); assert.equal(body.niveauDetail, 'PARTIEL'); assert.equal(body.langues, 'fr+ff'); assert.equal(body.ecritures, 'Latn'); assert.equal(body.formesParalleles, 'National Archives'); assert.equal(body.structure, null);
    assert.equal(ficheProblems({ ...emptyFicheForm(), langues: 'français' }).length, 1);
    assert.equal(ficheProblems({ ...emptyFicheForm(), ecritures: 'latin' }).length, 1);
    assert.deepEqual(ficheProblems({ ...emptyFicheForm(), langues: 'fr+man', ecritures: 'Latn+Nkoo' }), []);
});

test('Une fiche validée exige l’identifiant du service, l’adresse et les horaires', () => {
    assert.deepEqual(ficheProblems({ ...emptyFicheForm(), statut: 'VALIDEE' }), ['Une fiche validée exige : identifiant du service, adresse, horaires d’ouverture.']);
    assert.deepEqual(ficheProblems({ ...emptyFicheForm(), statut: 'VALIDEE', identifiantService: 'GN-ANG', adresse: 'Conakry' }), ['Une fiche validée exige : horaires d’ouverture.']);
    assert.deepEqual(ficheProblems({ ...emptyFicheForm(), statut: 'VALIDEE', identifiantService: 'GN-ANG', adresse: 'Conakry', horaires: '8 h – 16 h' }), []);
    assert.deepEqual(ficheProblems({ ...emptyFicheForm(), statut: 'A_RELIRE' }), []);
});

test('L’état et le niveau de détail se lisent en toutes lettres, les saisies courtes ont leur longueur', () => {
    const field = key => FICHE_GROUPS.flatMap(g => g.fields).find(f => f.key === key);
    assert.equal(ficheDisplay(field('statut'), 'A_RELIRE'), FICHE_STATUS_LABELS.A_RELIRE); assert.equal(ficheDisplay(field('niveauDetail'), 'COMPLET'), 'Complet'); assert.equal(ficheDisplay(field('adresse'), 'Conakry'), 'Conakry');
    assert.equal(ficheMaxLength(field('codePays')), 2); assert.equal(ficheMaxLength(field('identifiantService')), 16); assert.equal(ficheMaxLength(field('courriel')), 200); assert.equal(ficheMaxLength(field('telephone')), 60);
});

test('Le pays et l’identifiant du service sont contrôlés et envoyés à la forme normale', () => {
    const body = ficheBody('i1', { ...emptyFicheForm(), codePays: ' gn ', identifiantService: ' GN-ANG ' }, 0);
    assert.equal(body.codePays, 'GN'); assert.equal(body.identifiantService, 'GN-ANG');
    assert.deepEqual(ficheProblems({ ...emptyFicheForm(), codePays: 'GN', identifiantService: 'GN-ANG' }), []);
    assert.equal(ficheProblems({ ...emptyFicheForm(), codePays: 'GIN' }).length, 1);
    assert.equal(ficheProblems({ ...emptyFicheForm(), identifiantService: 'ANG' }).length, 1);
    assert.match(ficheProblems({ ...emptyFicheForm(), codePays: 'GN', identifiantService: 'FR-ANG' }).join(' '), /ne correspond pas au pays/);
});
