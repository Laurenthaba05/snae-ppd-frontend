import test from 'node:test';
import assert from 'node:assert/strict';
import { FICHE_GROUPS, emptyFicheForm, ficheBody, ficheCompleteness, ficheFormOf, ficheProblems } from '../.test-build/institutionFiche.js';

const view = (extra = {}) => ({ input: { institutionId: 'i1', adresse: 'Conakry', telephone: null, courriel: 'archives@exemple.gn', siteWeb: null, horaires: null, accessibilite: null, services: null, histoire: null, mandat: null, politiqueAcquisition: null, tutelleInstitutionId: null, version: 2, ...extra }, code: 'AN', nom: 'Archives nationales', sigle: 'AN', tutelleNom: null, version: 2, updatedAt: '2026-10-09T00:00:00Z' });

test('La fiche suit les zones ISDIAH : contact, accès et services, contexte', () => {
    assert.deepEqual(FICHE_GROUPS.map(g => g.title), ['Contact', 'Accès et services', 'Contexte']);
    assert.deepEqual(FICHE_GROUPS.flatMap(g => g.fields.map(f => f.key)), ['adresse', 'telephone', 'courriel', 'siteWeb', 'horaires', 'accessibilite', 'services', 'histoire', 'mandat', 'politiqueAcquisition']);
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
    assert.deepEqual(body, { institutionId: 'i1', adresse: 'Conakry', telephone: '+224 62', courriel: 'a@b.gn', siteWeb: null, horaires: null, accessibilite: null, services: null, histoire: null, mandat: null, politiqueAcquisition: null, tutelleInstitutionId: null, version: 3 });
    assert.equal(ficheBody('i1', { ...emptyFicheForm(), tutelleInstitutionId: 't9' }, 0).tutelleInstitutionId, 't9');
});

test('L’avancement de la fiche compte les zones renseignées et la tutelle', () => {
    assert.deepEqual(ficheCompleteness(null), { done: 0, total: 11 });
    assert.deepEqual(ficheCompleteness(view()), { done: 2, total: 11 });
    assert.deepEqual(ficheCompleteness(view({ tutelleInstitutionId: 't1', histoire: 'x' })), { done: 4, total: 11 });
});
