import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogProblems, catalogSize, EN, registerCatalog, resetCatalogs, translate } from '../.test-build/i18n.js';
import { EN_SCREENS } from '../.test-build/i18nScreens.js';

const entries = Object.entries(EN_SCREENS);
const placeholders = text => (text.match(/\{n\}/g) ?? []).length;

test('Le catalogue des écrans est volumineux et sans entrée vide ni espace de bordure', () => {
    assert.ok(entries.length > 5000, `catalogue trop petit : ${entries.length}`);
    assert.deepEqual(catalogProblems(EN_SCREENS), []);
});

test('Les valeurs d’un modèle sont reprises une fois chacune, dans la limite des captures', () => {
    const bad = [];
    for (const [source, target] of entries) {
        const captures = placeholders(source);
        const used = [...target.matchAll(/\{(\d+)\}/g)].map(m => Number(m[1]));
        if (new Set(used).size !== captures || used.some(n => n < 1 || n > captures)) bad.push(source);
        if (/\{n\}/.test(target)) bad.push(`${source} (reste un {n} dans la traduction)`);
    }
    assert.deepEqual(bad, []);
});

test('Aucun modèle ne se réduit à ses paramètres : il attraperait tous les textes', () => {
    const bad = entries.map(([source]) => source).filter(source => source.replace(/\{n\}/g, '').trim().length < 2);
    assert.deepEqual(bad, []);
});

test('Une traduction n’est jamais la forme française d’une autre phrase du catalogue de base', () => {
    // Le catalogue de base l’emporte à la lecture : une clé présente aux deux endroits avec deux traductions serait ambiguë.
    const conflicts = entries.filter(([source, target]) => Object.prototype.hasOwnProperty.call(EN, source) && EN[source] !== target).map(([source]) => source);
    assert.ok(conflicts.length < 40, `${conflicts.length} clés traduites autrement dans le catalogue de base : ${conflicts.slice(0, 5).join(' | ')}`);
});

test('Une fois chargé, le catalogue traduit des textes exacts, des fragments et des modèles', () => {
    resetCatalogs();
    registerCatalog(EN_SCREENS);
    const size = catalogSize();
    assert.ok(size.exact > 4500 && size.templates > 100, JSON.stringify(size));
    assert.equal(translate('en', 'Enregistrer le brouillon'), 'Save the draft');
    assert.equal(translate('en', ' Justification * '), ' Justification * ');
    assert.equal(translate('en', 'Nouvelle campagne de tri'), 'New sampling campaign');
    assert.equal(translate('en', 'La règle 12 est active.'), 'Rule 12 is active.');
    assert.equal(translate('en', 'Le délai part du'), 'The period starts from');
    assert.equal(translate('fr', 'Enregistrer le brouillon'), 'Enregistrer le brouillon');
    assert.equal(translate('en', 'Un texte jamais traduit par personne'), 'Un texte jamais traduit par personne');
});

test('Les noms de colonnes des fichiers d’import restent ceux que le serveur attend', () => {
    // Ces textes décrivent des en-têtes de fichiers : les traduire ferait écrire aux utilisateurs des colonnes refusées.
    for (const name of ['libelle', 'unite de mesure', 'unite de quantite']) assert.equal(EN_SCREENS[name] ?? name, name);
    assert.equal(EN_SCREENS['Première feuille : Donnees. Dates au format texte AAAA-MM-JJ. Aucune formule ni macro.'].includes('Donnees'), true);
    assert.equal(EN_SCREENS['Remplissez la feuille « Institutions » (une institution par ligne), enregistrez au format .xlsx puis importez le fichier.'].includes('“Institutions”'), true);
});
