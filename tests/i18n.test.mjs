import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LOCALE, EN, LOCALES, catalogProblems, pageSummary, parseLocale, translate } from '../.test-build/i18n.js';

test('Le français est la langue par défaut et une valeur inconnue y ramène', () => {
    assert.equal(DEFAULT_LOCALE, 'fr');
    assert.equal(parseLocale('en'), 'en');
    assert.equal(parseLocale('fr'), 'fr');
    for (const value of [undefined, null, '', 'de', 'EN', 42, {}]) assert.equal(parseLocale(value), 'fr');
    assert.deepEqual(LOCALES.map(l => l.code), ['fr', 'en']);
});

test('La traduction ne devine rien : un texte absent du catalogue reste en français', () => {
    assert.equal(translate('fr', 'Tableau de bord'), 'Tableau de bord');
    assert.equal(translate('en', 'Tableau de bord'), 'Dashboard');
    assert.equal(translate('en', 'Un texte que personne n’a traduit'), 'Un texte que personne n’a traduit');
    assert.equal(translate('en', ''), '');
});

test('Le catalogue est sain : pas de clé vide, de traduction vide ni d’espace en bordure', () => {
    assert.deepEqual(catalogProblems(), []);
    assert.deepEqual(catalogProblems({ ' a': 'x', b: ' ', '': 'y' }).length, 4);
    assert.ok(Object.keys(EN).length > 150);
});

test('Le catalogue couvre la coque : groupes, entrées de menu, états usuels, notifications', () => {
    for (const text of ['Identité & organisation', 'Collecte', 'Accès', 'Traitements', 'Conservation', 'Patrimoine', 'Pilotage', 'Accompagnement', 'Mes notifications', 'Mon profil',
        'Actif', 'Suspendu', 'Brouillon', 'Chargement des données…', 'Aucun résultat', 'Précédente', 'Suivante', 'Tout marquer comme lu', 'Se déconnecter']) {
        assert.ok(EN[text], `« ${text} » n’est pas traduit`);
        assert.notEqual(translate('en', text), '', text);
    }
});

test('Le pluriel suit la langue', () => {
    assert.equal(pageSummary('fr', 1, 1), '1 élément sur cette page · page 1');
    assert.equal(pageSummary('fr', 12, 3), '12 éléments sur cette page · page 3');
    assert.equal(pageSummary('en', 1, 1), '1 item on this page · page 1');
    assert.equal(pageSummary('en', 12, 3), '12 items on this page · page 3');
    assert.equal(pageSummary('fr', 0, 1), '0 élément sur cette page · page 1');
});
