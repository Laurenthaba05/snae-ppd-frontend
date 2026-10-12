import test from 'node:test';
import assert from 'node:assert/strict';
import { dateText, changedFields, parseList, listText, parseRefs, refsText, transitionLabel, gapSummary, journalValue, needsCorrectionMotif, motifValide, label,
    DESCRIPTION_LABELS, DISPONIBILITE_LABELS, FIELD_GROUPS, EDITABLE_FIELDS, FIELD_LABELS, PRECISION_LABELS } from '../.test-build/heritageAssets.js';

test('Date d’un bien : la précision déclarée décide, une date inconnue reste inconnue', () => {
    assert.equal(dateText('INCONNUE', null, null), 'Date inconnue');
    assert.equal(dateText('NON_RENSEIGNEE', null, null), 'Date non renseignée');
    assert.equal(dateText('EXACTE', '1952-03-12', '1952-03-12'), '12 mars 1952');
    assert.equal(dateText('EXACTE', '1952-03-12', '1952-04-14'), '12 mars 1952 – 14 avril 1952');
    assert.equal(dateText('EXACTE', null, null), 'Date non renseignée');
    assert.equal(dateText('ANNEE', '1952-01-01', null), '1952');
    assert.equal(dateText('ANNEE', '1952-01-01', '1960-12-31'), '1952 – 1960');
    assert.equal(dateText('DECENNIE', '1953-01-01', null), 'années 1950');
    assert.equal(dateText('SIECLE', '1950-01-01', null), 'XXe siècle');
    assert.equal(dateText('SIECLE', '1900-01-01', null), 'XIXe siècle');
    assert.equal(dateText('SIECLE', '1801-01-01', null), 'XIXe siècle');
    assert.equal(dateText('ESTIMEE', '1930-01-01', null), 'vers 1930');
    assert.equal(dateText('ESTIMEE', '1925-01-01', '1935-12-31'), 'entre 1925 et 1935');
    assert.equal(dateText('ESTIMEE', null, null), 'Date estimée');
    // Le texte libre prime : « vers 1930 » reste « vers 1930 », sans fausse date précise.
    assert.equal(dateText('ESTIMEE', '1930-01-01', null, '  vers 1930, d’après l’écriture  '), 'vers 1930, d’après l’écriture');
});

test('Champs modifiés : seuls les écarts partent, un champ vidé est effacé, les listes se comparent', () => {
    const original = { intitule: 'Registre', resume: 'Un registre', langues: ['français'], support: null, attributionIncertaine: false };
    assert.deepEqual(changedFields(original, { intitule: 'Registre', resume: 'Un registre  ' }), {});
    assert.deepEqual(changedFields(original, { intitule: 'Registre 1952', resume: 'Un registre' }), { intitule: 'Registre 1952' });
    assert.deepEqual(changedFields(original, { resume: '   ' }), { resume: null });
    assert.deepEqual(changedFields(original, { langues: [] }), { langues: [] });
    assert.deepEqual(changedFields(original, { langues: ['français', 'pular'] }), { langues: ['français', 'pular'] });
    assert.deepEqual(changedFields(original, { langues: ['français'] }), {});
    assert.deepEqual(changedFields(original, { support: '' }), {});
    assert.deepEqual(changedFields(original, { support: 'Papier' }), { support: 'Papier' });
    assert.deepEqual(changedFields(original, { attributionIncertaine: true }), { attributionIncertaine: true });
});

test('Listes et anciennes références saisies à la main', () => {
    assert.deepEqual(parseList(' français, pular ;français\nsoussou '), ['français', 'pular', 'soussou']);
    assert.deepEqual(parseList('  '), []);
    assert.equal(listText(['a', 'b']), 'a, b');
    assert.equal(listText(null), '');
    assert.deepEqual(parseRefs('Inventaire 1978 : A-12\n\nCatalogue : 77:b'), [{ systeme: 'Inventaire 1978', valeur: 'A-12' }, { systeme: 'Catalogue', valeur: '77:b' }]);
    assert.deepEqual(parseRefs(''), []);
    assert.equal(parseRefs('sans séparateur'), null);
    assert.equal(parseRefs(': valeur seule'), null);
    assert.equal(parseRefs('système :'), null);
    assert.equal(refsText([{ systeme: 'Inventaire 1978', valeur: 'A-12' }]), 'Inventaire 1978 : A-12');
});

test('Passages de la description : libellés, motif de correction et manques', () => {
    assert.equal(transitionLabel('MINIMALE', 'EN_REDACTION'), 'Commencer la rédaction');
    assert.equal(transitionLabel('EN_REDACTION', 'A_RELIRE'), 'Soumettre à la relecture');
    assert.equal(transitionLabel('A_RELIRE', 'VALIDEE'), 'Valider scientifiquement');
    assert.equal(transitionLabel('A_RELIRE', 'EN_REDACTION'), 'Renvoyer en rédaction');
    assert.equal(transitionLabel('VALIDEE', 'EN_REDACTION'), 'Rouvrir la description');
    assert.equal(needsCorrectionMotif({ statutDescription: 'VALIDEE' }), true);
    assert.equal(needsCorrectionMotif({ statutDescription: 'EN_REDACTION' }), false);
    assert.equal(motifValide('court'), false);
    assert.equal(motifValide('  Attribution corrigée  '), true);
    const gaps = [{ code: 'NO_SUMMARY', message: '', bloque: 'RELECTURE' }, { code: 'NO_VALUE_CRITERIA', message: '', bloque: 'VALIDATION' }, { code: 'NO_ORIGINAL_LINKED', message: '', bloque: null }];
    assert.deepEqual(gapSummary({ lacunes: gaps }), { relecture: 1, validation: 2, informations: 1 });
});

test('Journal et libellés : valeurs lisibles, états en français', () => {
    assert.equal(journalValue(null), '—');
    assert.equal(journalValue(''), '—');
    assert.equal(journalValue(['HISTORIQUE', 'SOCIAL']), 'HISTORIQUE, SOCIAL');
    assert.equal(journalValue([]), '—');
    assert.equal(journalValue(true), 'Oui');
    assert.equal(journalValue('DECENNIE'), 'DECENNIE');
    assert.equal(label(DESCRIPTION_LABELS, 'A_RELIRE'), 'À relire');
    assert.equal(label(DISPONIBILITE_LABELS, 'NON_LOCALISE'), 'Non localisé');
    assert.equal(label(DISPONIBILITE_LABELS, 'INCONNU_X'), 'INCONNU_X');
    assert.equal(label(DISPONIBILITE_LABELS, null), '—');
});

test('Formulaire : chaque champ a un libellé, les précisions de date sont celles du serveur, aucun champ en double', () => {
    const names = EDITABLE_FIELDS.map(f => f.name);
    assert.equal(new Set(names).size, names.length);
    for (const name of names) assert.ok(FIELD_LABELS[name], 'libellé manquant : ' + name);
    assert.deepEqual(Object.keys(PRECISION_LABELS).sort(), ['ANNEE', 'DECENNIE', 'ESTIMEE', 'EXACTE', 'INCONNUE', 'NON_RENSEIGNEE', 'SIECLE']);
    assert.deepEqual(FIELD_GROUPS.map(g => g.id), ['identification', 'description', 'contexte', 'provenance', 'valeur']);
    // Les champs de la politique du serveur absents du formulaire sont des références gérées ailleurs ou par d'autres flux.
    const serverOnly = ['producteurId', 'archivalDescriptionId', 'proprietaireActeurId', 'deposantActeurId', 'entreeArchivistiqueId', 'valeurDateEvaluation', 'etatMateriel'];
    const server = ['intitule', 'numeroInventaire', 'anciennesReferences', 'categorie', 'natureOriginale', 'resume', 'langues', 'ecritures', 'support', 'materiaux', 'dimensions', 'quantite', 'uniteQuantite',
        'paginationDuree', 'dateDebut', 'dateFin', 'precisionDate', 'dateTexte', 'dateSource', 'attributionIncertaine', 'attributionSource', 'bibliographie', 'historiqueProvenance', 'provenanceStatut',
        'proprietaireStatut', 'situationJuridique', 'situationJuridiqueNote', 'valeurCriteres', 'valeurAppreciation', 'valeurSources',
        // compléments Spectrum (V99)
        'titresAlternatifs', 'technique', 'periodeCulture', 'inscriptions', 'valeurAssurance', 'valeurAssuranceDevise', 'valeurAssuranceDate', 'droitsImage', 'droitsImageNote'];
    assert.deepEqual([...names].sort(), [...server].sort());
    assert.ok(serverOnly.every(n => !names.includes(n)));
});

test('Titres alternatifs : un par ligne « type : titre », une ligne mal formée refuse tout', async () => {
    const { parseTitles, titlesText, DROITS_IMAGE_LABELS } = await import('../.test-build/heritageAssets.js');
    assert.deepEqual(parseTitles(''), []);
    assert.deepEqual(parseTitles('Titre ancien : Registre des déclarations\n  Titre usuel :  Livre des naissances  '),
        [{ type: 'Titre ancien', valeur: 'Registre des déclarations' }, { type: 'Titre usuel', valeur: 'Livre des naissances' }]);
    assert.deepEqual(parseTitles('Titre : A : B'), [{ type: 'Titre', valeur: 'A : B' }]);
    for (const bad of ['pas de séparateur', ': sans type', 'Type :', 'x'.repeat(101) + ' : titre', 'Type : ' + 'y'.repeat(501)]) assert.equal(parseTitles(bad), null, bad);
    assert.equal(titlesText([{ type: 'Titre ancien', valeur: 'Registre' }]), 'Titre ancien : Registre');
    assert.equal(titlesText(null), '');
    for (const code of ['NON_RENSEIGNES', 'DOMAINE_PUBLIC', 'DROITS_DETENUS', 'DROITS_TIERS', 'A_CLARIFIER']) assert.ok(DROITS_IMAGE_LABELS[code], code);
});

test('Les compléments Spectrum sont dans les groupes de la fiche, avec leur libellé', () => {
    const names = EDITABLE_FIELDS.map(f => f.name);
    for (const name of ['titresAlternatifs', 'technique', 'periodeCulture', 'inscriptions', 'valeurAssurance', 'valeurAssuranceDevise', 'valeurAssuranceDate', 'droitsImage', 'droitsImageNote']) {
        assert.ok(names.includes(name), name);
        assert.ok(FIELD_LABELS[name], 'libellé de ' + name);
    }
    const group = id => FIELD_GROUPS.find(g => g.id === id).fields.map(f => f.name);
    assert.ok(group('description').includes('technique'));
    assert.ok(group('provenance').includes('droitsImage'));
    assert.ok(group('valeur').includes('valeurAssurance'));
});

test('Un champ absent de la fiche n’est pas modifié par un brouillon vide, ni une liste vide par rien', () => {
    assert.deepEqual(changedFields({ technique: null }, { technique: '', titresAlternatifs: [] }), {});
    assert.deepEqual(changedFields({}, { technique: '  ', titresAlternatifs: [] }), {});
    assert.deepEqual(changedFields({ titresAlternatifs: [{ type: 'a', valeur: 'b' }] }, { titresAlternatifs: [] }), { titresAlternatifs: [] });
});
