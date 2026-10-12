import test from 'node:test';
import assert from 'node:assert/strict';
import { agreementBody, agreementFormProblems, agreementTitle, emptyAgreementForm, factsOf, formOfAgreement, inForce, nextStatuses, volumeText } from '../.test-build/depositAgreements.js';

const view = (over = {}) => ({ id: 'a1', version: 3, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', versements: 0,
    input: { reference: 'ACC-1', intitule: 'Versements annuels', producteurId: 'p', serviceVersantId: null, institutionArchivesId: 'i', statut: 'ACTIF', dateDebut: '2026-01-01', dateFin: '2026-12-31',
        periodicite: 'ANNUEL', volumePrevu: 12.5, uniteVolume: 'ML', formatsAcceptes: 'PDF/A, TIFF', conditions: null, ...over } });

test('Le statut d’un accord suit projet, actif, suspendu, clos', () => {
    assert.deepEqual(nextStatuses('PROJET'), ['PROJET', 'ACTIF', 'CLOS']);
    assert.deepEqual(nextStatuses('ACTIF'), ['ACTIF', 'SUSPENDU', 'CLOS']);
    assert.deepEqual(nextStatuses('SUSPENDU'), ['SUSPENDU', 'ACTIF', 'CLOS']);
    assert.deepEqual(nextStatuses('CLOS'), ['CLOS']);                         // un accord clos ne change plus
});

test('Le formulaire d’un accord se convertit sans perte', () => {
    const v = view({ serviceVersantId: 's', conditions: 'Transfert par lots' });
    const body = agreementBody(formOfAgreement(v), v.version);
    assert.deepEqual(body, { ...v.input, version: 3 });
    const empty = agreementBody(emptyAgreementForm('i'), 0);
    assert.equal(empty.dateFin, null); assert.equal(empty.volumePrevu, null); assert.equal(empty.uniteVolume, null); assert.equal(empty.statut, 'PROJET'); assert.equal(empty.institutionArchivesId, 'i');
});

test('Un accord incomplet ou incohérent dit ce qui manque', () => {
    assert.deepEqual(agreementFormProblems(formOfAgreement(view())), []);
    const empty = agreementFormProblems(emptyAgreementForm());
    assert.deepEqual(empty, ['La référence de l’accord est obligatoire.', 'L’intitulé de l’accord est obligatoire.', 'Choisissez le service d’archives destinataire.', 'Choisissez le producteur.', 'La date de début est obligatoire.']);
    const form = formOfAgreement(view());
    assert.deepEqual(agreementFormProblems({ ...form, dateFin: '2025-12-31' }), ['La date de fin précède la date de début.']);
    assert.deepEqual(agreementFormProblems({ ...form, volumePrevu: '12' , uniteVolume: '' }), ['Indiquez le volume prévu ET son unité, ou aucun des deux.']);
    assert.deepEqual(agreementFormProblems({ ...form, volumePrevu: '', uniteVolume: 'ML' }), ['Indiquez le volume prévu ET son unité, ou aucun des deux.']);
    assert.deepEqual(agreementFormProblems({ ...form, volumePrevu: 'douze' }), ['Le volume prévu est un nombre positif (12 ou 12,5).']);
    assert.deepEqual(agreementFormProblems({ ...form, volumePrevu: '', uniteVolume: '' }), []);
});

test('En vigueur : actif et dans sa période, dernier jour inclus', () => {
    assert.equal(inForce(view(), '2026-10-09'), true);
    assert.equal(inForce(view(), '2026-12-31'), true);
    assert.equal(inForce(view(), '2027-01-01'), false);
    assert.equal(inForce(view(), '2025-12-31'), false);
    assert.equal(inForce(view({ statut: 'SUSPENDU' }), '2026-10-09'), false);
    assert.equal(inForce(view({ dateFin: null }), '2030-01-01'), true);
});

test('Les libellés d’un accord', () => {
    assert.equal(agreementTitle(view()), 'ACC-1 · Versements annuels');
    assert.equal(volumeText(view()), '12,5 mètres linéaires par an');
    assert.equal(volumeText(view({ periodicite: 'PONCTUEL' })), '12,5 mètres linéaires');
    assert.equal(volumeText(view({ periodicite: 'MENSUEL', volumePrevu: 2, uniteVolume: 'BOITES' })), '2 boîtes par mois');
    assert.equal(volumeText(view({ volumePrevu: null, uniteVolume: null })), '');
    assert.equal(factsOf(view()).reference, 'ACC-1');
});
