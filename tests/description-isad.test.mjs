import test from 'node:test';
import assert from 'node:assert/strict';
import { DESCRIPTION_GROUPS, EXTENT_UNITS, ISAD_ELEMENT_COUNT, descriptionProblems, extentText, isadCompleteness, missingForValidation, producerKnown } from '../.test-build/archivalDescription.js';

test('Les zones suivent la norme et chaque champ a un libellé, sans doublon de clé', () => {
    assert.deepEqual(DESCRIPTION_GROUPS.map(g => g.title), ['Identification', 'Contexte', 'Contenu et structure', 'Conditions d’accès et d’utilisation', 'Sources complémentaires', 'Notes et contrôle de la description']);
    const keys = DESCRIPTION_GROUPS.flatMap(g => g.fields.map(f => f.key));
    assert.equal(new Set(keys).size, keys.length);
    for (const field of DESCRIPTION_GROUPS.flatMap(g => g.fields)) assert.ok(field.label.length > 3, field.key);
    // les 10 éléments qui manquaient à la notice, désormais saisissables
    for (const key of ['accruals', 'scripts', 'physicalCharacteristics', 'originalsLocation', 'copiesLocation', 'relatedUnits', 'publicationNote', 'note', 'archivistNote', 'rules']) assert.ok(keys.includes(key), key);
    assert.deepEqual(EXTENT_UNITS.map(u => u.code), ['ML', 'GO', 'BOITES', 'REGISTRES', 'ARTICLES', 'PIECES', 'FEUILLETS', 'PAGES', 'PLANS', 'PHOTOGRAPHIES', 'FICHIERS']);
});

test('L’importance matérielle se lit en une ligne, quantité structurée d’abord', () => {
    assert.equal(extentText({}), '');
    assert.equal(extentText({ extentQuantity: '12.5', extentUnit: 'ML' }), '12,5 mètres linéaires');
    assert.equal(extentText({ extentQuantity: '12,5', extentUnit: 'ML', medium: ' papier ', extent: 'dont 3 boîtes de plans' }), '12,5 mètres linéaires — papier — dont 3 boîtes de plans');
    assert.equal(extentText({ extent: 'registres reliés' }), 'registres reliés');
    assert.equal(extentText({ extentQuantity: 'douze', extentUnit: 'ML' }), '');       // une quantité invalide ne s’affiche pas comme valide
    assert.equal(extentText({ extentQuantity: '3', extentUnit: 'INCONNUE' }), '');
});

test('Une description validée exige dates, importance matérielle et producteur', () => {
    assert.deepEqual(missingForValidation({}, false), ['dates', 'importance matérielle', 'producteur']);
    assert.deepEqual(missingForValidation({ dateLabel: 'vers 1960', extent: '3 boîtes' }, true), []);
    assert.deepEqual(missingForValidation({ dateEnd: '1970-01-01', extentQuantity: '2', extentUnit: 'BOITES' }, true), []);
    assert.deepEqual(missingForValidation({ dateStart: '1960-01-01' }, true), ['importance matérielle']);
});

test('Le producteur peut venir d’un niveau supérieur, sans boucler sur des données incohérentes', () => {
    const nodes = [{ id: 'f', parentId: null, producerId: 'p' }, { id: 's', parentId: 'f', producerId: null }, { id: 'd', parentId: 's', producerId: null }, { id: 'x', parentId: null, producerId: null }, { id: 'y', parentId: 'x', producerId: null }];
    assert.equal(producerKnown(null, 's', nodes), true);
    assert.equal(producerKnown(null, 'f', nodes), true);
    assert.equal(producerKnown('q', null, []), true);
    assert.equal(producerKnown(null, 'x', nodes), false);
    assert.equal(producerKnown(null, 'absent', nodes), false);
    assert.equal(producerKnown(null, null, nodes), false);
    assert.equal(producerKnown(null, 'a', [{ id: 'a', parentId: 'b', producerId: null }, { id: 'b', parentId: 'a', producerId: null }]), false);
});

test('Avant l’envoi : quantité et unité vont ensemble, et la validation a ses exigences', () => {
    assert.deepEqual(descriptionProblems({}, false), []);
    assert.deepEqual(descriptionProblems({ extentQuantity: '3' }, false), ['Importance matérielle : indiquez la quantité ET l’unité, ou aucune des deux.']);
    assert.deepEqual(descriptionProblems({ extentUnit: 'ML' }, false), ['Importance matérielle : indiquez la quantité ET l’unité, ou aucune des deux.']);
    assert.match(descriptionProblems({ extentQuantity: '-3', extentUnit: 'ML' }, false)[0], /un nombre/);
    assert.match(descriptionProblems({ extentQuantity: '1,2345', extentUnit: 'ML' }, false)[0], /trois décimales/);
    assert.deepEqual(descriptionProblems({ status: 'VALIDEE' }, false), ['Une description validée exige : dates, importance matérielle, producteur.']);
    assert.deepEqual(descriptionProblems({ status: 'VALIDEE', dateStart: '1960-01-01', extent: 'x' }, true), []);
    assert.deepEqual(descriptionProblems({ status: 'A_RELIRE' }, false), []);
});

test('Le nombre d’éléments ISAD(G) renseignés se compte sur les 26 de la norme', () => {
    assert.equal(ISAD_ELEMENT_COUNT, 26);
    // une description vide a déjà la référence, l’intitulé, le niveau et les dates du système
    assert.deepEqual(isadCompleteness({}, false), { done: 4, total: 26 });
    assert.deepEqual(isadCompleteness({}, true), { done: 6, total: 26 });          // le producteur apporte son nom et son histoire
    const full = Object.fromEntries(DESCRIPTION_GROUPS.flatMap(g => g.fields.map(f => [f.key, f.key === 'extentQuantity' ? '2' : f.key === 'extentUnit' ? 'ML' : f.key === 'status' ? 'VALIDEE' : 'x'])));
    assert.deepEqual(isadCompleteness(full, true), { done: 26, total: 26 });
    assert.equal(isadCompleteness({ dateLabel: 'vers 1960', scripts: 'latin', note: 'n' }, false).done, 4 + 3);
});
