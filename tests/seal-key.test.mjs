import test from 'node:test';
import assert from 'node:assert/strict';
import { badge, storeLabel, usageText, validityText } from '../.test-build/sealKey.js';

test('La garde de la clé se dit en clair', () => {
    assert.equal(storeLabel({ storeType: 'PKCS11', hardware: true }), 'Module matériel (PKCS#11)');
    assert.equal(storeLabel({ storeType: 'PKCS12', hardware: false }), 'Magasin logiciel (PKCS#12)');
    assert.equal(storeLabel({ storeType: null, hardware: false }), 'Magasin logiciel (PKCS#12)');
});

test('La validité dit les jours restants et signale la rotation à préparer', () => {
    assert.equal(validityText({ daysRemaining: null, rotationDue: false, rotationWarnDays: 90 }), '—');
    assert.equal(validityText({ daysRemaining: -3, rotationDue: true, rotationWarnDays: 90 }), 'Expiré');
    assert.equal(validityText({ daysRemaining: 0, rotationDue: true, rotationWarnDays: 90 }), 'Expire aujourd’hui — rotation à préparer (seuil : 90 jours)');
    assert.equal(validityText({ daysRemaining: 1, rotationDue: false, rotationWarnDays: 90 }), '1 jour restant');
    assert.equal(validityText({ daysRemaining: 200, rotationDue: false, rotationWarnDays: 90 }), '200 jours restants');
    assert.equal(validityText({ daysRemaining: 30, rotationDue: true, rotationWarnDays: 90 }), '30 jours restants — rotation à préparer (seuil : 90 jours)');
});

test('Le nombre d’actes scellés s’accorde', () => {
    assert.equal(usageText({ seals: 1 }), '1 acte scellé');
    assert.equal(usageText({ seals: 12 }), '12 actes scellés');
});

test('La pastille suit l’activation et l’expiration', () => {
    assert.equal(badge({ enabled: false, daysRemaining: null }), 'BROUILLON');
    assert.equal(badge({ enabled: true, daysRemaining: 10 }), 'ACTIF');
    assert.equal(badge({ enabled: true, daysRemaining: -1 }), 'ECHEC');
});
