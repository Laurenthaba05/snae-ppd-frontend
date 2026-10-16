import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogSize, registerCatalog, resetCatalogs, translate } from '../.test-build/i18n.js';

test('Un catalogue complémentaire traduit un texte exact, les espaces de bordure sont conservés', () => {
    resetCatalogs();
    registerCatalog({ 'Aucun résultat pour ce filtre.': 'No result for this filter.', '· à revoir avant le': '· to review before' });
    assert.equal(translate('en', 'Aucun résultat pour ce filtre.'), 'No result for this filter.');
    assert.equal(translate('en', ' · à revoir avant le '), ' · to review before ');
    assert.equal(translate('fr', 'Aucun résultat pour ce filtre.'), 'Aucun résultat pour ce filtre.');
    assert.equal(translate('en', 'Un texte absent'), 'Un texte absent');
    assert.equal(translate('en', '   '), '   ');
});

test('Un modèle capte les valeurs et la traduction les reprend dans son ordre', () => {
    resetCatalogs();
    registerCatalog({ 'Sur {n} fichiers : {n} conformes': 'Out of {1} files: {2} compliant', '{n} document(s) dans {n}': 'In {2}: {1} document(s)' });
    assert.equal(translate('en', 'Sur 12 fichiers : 9 conformes'), 'Out of 12 files: 9 compliant');
    assert.equal(translate('en', '3 document(s) dans DOC-2026/01 (v. 2)'), 'In DOC-2026/01 (v. 2): 3 document(s)');
    assert.equal(translate('en', 'Sur 12 fichiers'), 'Sur 12 fichiers', 'un texte qui ne suit pas le modèle reste en français');
    assert.deepEqual(catalogSize(), { exact: 0, templates: 2 });
});

test('Les caractères spéciaux d’un modèle sont littéraux', () => {
    resetCatalogs();
    registerCatalog({ 'Coût ($) : {n} (TVA incluse ?)': 'Cost ($): {1} (VAT included?)' });
    assert.equal(translate('en', 'Coût ($) : 150 (TVA incluse ?)'), 'Cost ($): 150 (VAT included?)');
    assert.equal(translate('en', 'Coût ($) : 150 (TVA incluse X)'), 'Coût ($) : 150 (TVA incluse X)');
});

test('Un nom hérité de l’objet n’est jamais pris pour une traduction', () => {
    resetCatalogs();
    assert.equal(translate('en', 'constructor'), 'constructor');
    assert.equal(translate('en', 'toString'), 'toString');
});

test('Un texte aux espaces doublés ou aux retours à la ligne retrouve sa traduction', () => {
    resetCatalogs();
    registerCatalog({ 'Connectez un compte habilité pour les exécuter.': 'Connect an authorized account to run them.', 'Sur {n} pièces : {n} validées': 'Out of {1} items: {2} validated' });
    assert.equal(translate('en', 'Connectez un compte  habilité pour les exécuter.'), 'Connect an authorized account to run them.');
    assert.equal(translate('en', ' Connectez un compte\n   habilité pour les exécuter. '), ' Connect an authorized account to run them. ');
    assert.equal(translate('en', 'Sur 12 pièces  : 9 validées'), 'Out of 12 items: 9 validated');
});

test('Une valeur chiffrée collée à un texte du catalogue est conservée, le texte est traduit', () => {
    resetCatalogs();
    registerCatalog({ '% vérifié': '% verified', 'Page': 'Page', 'Lot': 'Batch' });
    assert.equal(translate('en', '50 % vérifié'), '50 % verified');
    assert.equal(translate('en', '3,5 % vérifié'), '3,5 % verified');
    assert.equal(translate('en', 'Lot 12'), 'Batch 12');
    assert.equal(translate('en', ' 12/40 % vérifié '), ' 12/40 % verified ');
    // un nom ou une phrase n'est jamais découpé
    assert.equal(translate('en', 'Université de Kankan 2'), 'Université de Kankan 2');
    assert.equal(translate('en', 'Du 1 octobre 2026 au 30 octobre 2026'), 'Du 1 octobre 2026 au 30 octobre 2026');
    assert.equal(translate('en', '50 inconnus'), '50 inconnus');
});

test('Un libellé repris dans une autre casse est traduit dans la casse du texte affiché', () => {
    resetCatalogs();
    registerCatalog({ 'À relire': 'To review', 'En rédaction': 'Being drafted', 'ligne': 'line', 'Import SKOS': 'SKOS import' });
    assert.equal(translate('en', 'à relire'), 'to review');
    assert.equal(translate('en', 'en rédaction'), 'being drafted');
    assert.equal(translate('en', 'Ligne'), 'Line');
    assert.equal(translate('en', 'import SKOS'), 'SKOS import'); // le sigle garde sa forme
    assert.equal(translate('en', 'à signer'), 'à signer');
});

test('Le catalogue de base l’emporte sur le catalogue complémentaire', () => {
    resetCatalogs();
    registerCatalog({ 'Tableau de bord': 'Panel' });
    assert.equal(translate('en', 'Tableau de bord'), 'Dashboard');
});
