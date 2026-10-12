import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTRY_STATUS_LABELS, ENTRY_FIELD_GROUPS, ENTRY_FIELD_LABELS, TERMINAL, entrySteps, entryTone, entryLabel, decisionChoices, entryTransitionLabel, transitionNeeds, needsForm,
    emptyTransitionForm, transitionProblems, transitionBody, entryJournalValue, receptionFields, receiptLines, receiptHtml, parseRepriseDate, parseRepriseTable, repriseTemplate,
    REPRISE_HEADERS, MAX_REPRISE_ROWS } from '../.test-build/heritageEntries.js';
import { dateText } from '../.test-build/heritageAssets.js';

const states = status => entrySteps(status).map(s => s.state).join(',');

test('Parcours d’une entrée : réception, examen, décision, puis formalisation ou restitution', () => {
    assert.equal(states('RECUE'), 'current,todo,todo,todo');
    assert.equal(states('EN_EXAMEN'), 'done,current,todo,todo');
    assert.equal(states('COMPLEMENT_REQUIS'), 'done,current,todo,todo');
    assert.equal(states('SITUATION_A_CLARIFIER'), 'done,current,todo,todo');
    // Une fois la décision prise, la suite reste à faire : la formalisation (ou la restitution) est l’étape courante.
    assert.equal(states('ACCEPTEE'), 'done,done,done,current');
    assert.equal(states('REFUSEE'), 'done,done,done,current');
    assert.equal(states('FORMALISEE'), 'done,done,done,done');
    assert.equal(states('RETOURNEE'), 'done,done,done,done');
    assert.equal(entrySteps('ACCEPTEE')[3].label, 'Formalisation');
    assert.equal(entrySteps('REFUSEE')[3].label, 'Restitution');
    assert.deepEqual([...TERMINAL].sort(), ['FORMALISEE', 'RETOURNEE']);
});

test('Étapes : libellés, tons et passages vus de la personne qui agit', () => {
    assert.equal(ENTRY_STATUS_LABELS.RETOURNEE, 'Restituée');
    assert.equal(entryLabel('EN_EXAMEN'), 'En examen');
    assert.equal(entryLabel(null), '—');
    assert.equal(entryTone('ACCEPTEE'), 'ok');
    assert.equal(entryTone('COMPLEMENT_REQUIS'), 'warn');
    assert.equal(entryTone('REFUSEE'), 'bad');
    assert.equal(entryTone('RECUE'), '');
    assert.equal(entryTransitionLabel('RECUE', 'EN_EXAMEN'), 'Commencer l’examen');
    assert.equal(entryTransitionLabel('COMPLEMENT_REQUIS', 'EN_EXAMEN'), 'Reprendre l’examen');
    assert.equal(entryTransitionLabel('EN_EXAMEN', 'ACCEPTEE'), 'Accepter la prise en charge');
    assert.equal(entryTransitionLabel('ACCEPTEE', 'FORMALISEE'), 'Formaliser par un acte');
    assert.equal(entryTransitionLabel('REFUSEE', 'RETOURNEE'), 'Enregistrer la restitution');
});

test('Un prêt entrant reste un prêt ; un don ou un dépôt proposé peut devenir acquisition ou dépôt', () => {
    assert.deepEqual(decisionChoices('PRET_ENTRANT'), ['PRET_ENTRANT']);
    assert.deepEqual(decisionChoices('DON'), ['ACQUISITION', 'DEPOT']);
    assert.deepEqual(decisionChoices('TRANSFERT'), ['ACQUISITION', 'DEPOT']);
    assert.deepEqual(decisionChoices('DEPOT'), ['ACQUISITION', 'DEPOT']);
    assert.deepEqual(decisionChoices('AUTRE'), ['ACQUISITION', 'DEPOT', 'PRET_ENTRANT']);
});

test('Ce qu’un passage demande en plus du clic', () => {
    const option = (vers, motifRequis = false, decision = false) => ({ vers, motifRequis, decision });
    assert.equal(needsForm(option('EN_EXAMEN')), false);
    assert.equal(needsForm(option('COMPLEMENT_REQUIS', true)), true);
    assert.deepEqual(transitionNeeds(option('EN_EXAMEN')), { motif: false, motifRequired: false, decision: false, convention: false, retour: false });
    assert.deepEqual(transitionNeeds(option('ACCEPTEE', false, true)), { motif: true, motifRequired: false, decision: true, convention: false, retour: false });
    assert.deepEqual(transitionNeeds(option('REFUSEE', true, true)), { motif: true, motifRequired: true, decision: false, convention: false, retour: false });
    assert.equal(transitionNeeds(option('FORMALISEE')).convention, true);
    assert.equal(transitionNeeds(option('RETOURNEE')).retour, true);
});

const entry = (champs = {}, extra = {}) => ({ champs: { modeReception: 'DON', situationJuridique: 'CLAIRE', ...champs }, decisionType: null, conventionReference: null, ...extra });
const form = (patch = {}) => ({ ...emptyTransitionForm(), ...patch });
const TODAY = '2026-10-04';

test('Acceptation : la nature de la prise en charge est exigée et reste cohérente avec la façon dont le bien est arrivé', () => {
    const accept = { vers: 'ACCEPTEE', motifRequis: false, decision: true };
    assert.match(transitionProblems(accept, form(), entry(), TODAY)[0], /nature de la prise en charge/);
    assert.deepEqual(transitionProblems(accept, form({ decisionType: 'DEPOT' }), entry(), TODAY), []);
    assert.deepEqual(transitionProblems(accept, form({ decisionType: 'ACQUISITION' }), entry(), TODAY), []);
    assert.match(transitionProblems(accept, form({ decisionType: 'ACQUISITION' }), entry({ modeReception: 'PRET_ENTRANT' }), TODAY)[0], /ne peut pas être acceptée comme acquisition/);
    assert.deepEqual(transitionProblems(accept, form({ decisionType: 'PRET_ENTRANT' }), entry({ modeReception: 'PRET_ENTRANT' }), TODAY), []);
});

test('Acquisition : une situation juridique à clarifier la refuse, le dépôt reste possible', () => {
    const accept = { vers: 'ACCEPTEE', motifRequis: false, decision: true };
    const unclear = entry({ situationJuridique: 'A_CLARIFIER' });
    assert.match(transitionProblems(accept, form({ decisionType: 'ACQUISITION' }), unclear, TODAY)[0], /situation juridique claire/);
    assert.deepEqual(transitionProblems(accept, form({ decisionType: 'DEPOT' }), unclear, TODAY), []);
});

test('Refus et demandes de complément : un motif écrit d’au moins 10 caractères', () => {
    const refuse = { vers: 'REFUSEE', motifRequis: true, decision: true };
    assert.match(transitionProblems(refuse, form({ motif: 'court' }), entry(), TODAY)[0], /au moins 10 caractères/);
    assert.match(transitionProblems(refuse, form({ motif: '          ' }), entry(), TODAY)[0], /au moins 10 caractères/);
    assert.deepEqual(transitionProblems(refuse, form({ motif: 'Provenance non établie après examen' }), entry(), TODAY), []);
});

test('Formalisation : un acte, et une échéance pour un dépôt ou un prêt entrant', () => {
    const formalise = { vers: 'FORMALISEE', motifRequis: false, decision: false };
    assert.match(transitionProblems(formalise, form(), entry({}, { decisionType: 'ACQUISITION' }), TODAY)[0], /référence de l’acte/);
    assert.deepEqual(transitionProblems(formalise, form({ conventionReference: 'Acte de don 7' }), entry({}, { decisionType: 'ACQUISITION' }), TODAY), []);
    const deposit = entry({}, { decisionType: 'DEPOT' });
    assert.match(transitionProblems(formalise, form({ conventionReference: 'Convention 12' }), deposit, TODAY)[0], /date de fin/);
    assert.deepEqual(transitionProblems(formalise, form({ conventionReference: 'Convention 12', conventionDateFin: '2031-10-04' }), deposit, TODAY), []);
    assert.match(transitionProblems(formalise, form({ conventionReference: 'C', conventionDateDebut: '2026-10-04', conventionDateFin: '2026-01-01' }), deposit, TODAY)[0], /doit suivre/);
    // La référence déjà enregistrée suffit.
    assert.deepEqual(transitionProblems(formalise, form(), entry({}, { decisionType: 'ACQUISITION', conventionReference: 'Acte déjà saisi' }), TODAY), []);
});

test('Restitution : date non future et destinataire', () => {
    const back = { vers: 'RETOURNEE', motifRequis: false, decision: false };
    assert.equal(transitionProblems(back, form(), entry(), TODAY).length, 2);
    assert.match(transitionProblems(back, form({ retourLe: '2026-12-01', retourDestinataire: 'M. Camara' }), entry(), TODAY)[0], /futur/);
    assert.deepEqual(transitionProblems(back, form({ retourLe: TODAY, retourDestinataire: 'M. Camara' }), entry(), TODAY), []);
});

test('Demande de passage : seuls les champs utiles et renseignés partent', () => {
    assert.deepEqual(transitionBody('EN_EXAMEN', 4, form()), { vers: 'EN_EXAMEN', expectedVersion: 4 });
    assert.deepEqual(transitionBody('ACCEPTEE', 5, form({ decisionType: 'DEPOT', motif: '  Accepté en dépôt  ', conventionReference: 'ne part pas' })), { vers: 'ACCEPTEE', expectedVersion: 5, decisionType: 'DEPOT', motif: 'Accepté en dépôt' });
    assert.deepEqual(transitionBody('FORMALISEE', 6, form({ conventionReference: 'Convention 12', conventionDateFin: '2031-10-04', retourLe: '2026-10-01' })),
        { vers: 'FORMALISEE', expectedVersion: 6, conventionReference: 'Convention 12', conventionDateFin: '2031-10-04' });
    assert.deepEqual(transitionBody('RETOURNEE', 7, form({ retourLe: TODAY, retourDestinataire: ' M. Camara ', retourNote: '' })), { vers: 'RETOURNEE', expectedVersion: 7, retourLe: TODAY, retourDestinataire: 'M. Camara' });
});

test('Fiche d’entrée : mêmes champs que le serveur, tous nommés dans le journal', () => {
    const names = ENTRY_FIELD_GROUPS.flatMap(g => g.fields.map(f => f.name));
    assert.deepEqual([...names].sort(), ['conditionsProposees', 'conditionsRetenues', 'constatEtat', 'dateReception', 'deposantNom', 'descriptionLot', 'examenProvenance', 'modeReception', 'moyensConservation',
        'motifReception', 'nombrePieces', 'situationJuridique', 'situationJuridiqueNote'].sort());
    for (const name of names) assert.ok(ENTRY_FIELD_LABELS[name], 'libellé manquant : ' + name);
    assert.equal(ENTRY_FIELD_LABELS.statut, 'Étape');
});

test('Journal : une étape se lit par son libellé, une valeur vide par un tiret', () => {
    assert.equal(entryJournalValue('statut', 'EN_EXAMEN'), 'En examen');
    assert.equal(entryJournalValue('statut', null), '—');
    assert.equal(entryJournalValue(null, ''), '—');
    assert.equal(entryJournalValue('bien', { bienId: 'x' }), '{"bienId":"x"}');
});

test('Réception : les champs vides sont omis et le nombre de pièces part tel quel', () => {
    assert.deepEqual(receptionFields({ modeReception: 'DON', dateReception: '', deposantNom: ' Famille Camara ', nombrePieces: ' 12 ', motifReception: '', descriptionLot: '' }),
        { modeReception: 'DON', deposantNom: 'Famille Camara', nombrePieces: '12' });
});

const receipt = { numero: 'ENT-2026-000001', institution: 'Archives nationales', dateReception: '2026-10-01', modeReception: 'DON', deposant: 'Famille <Camara> & fils', nombrePieces: 2, motifReception: null,
    mention: { code: 'EN_ATTENTE_DE_DECISION', texte: 'La remise des biens ne vaut ni acquisition, ni dépôt, ni prêt.' }, biens: [{ identifiant: 'PAT-000001', intitule: 'Registre « n°1 »' }] };

test('Reçu : la mention dit ce que la remise n’est pas, et le document imprimable échappe tout le texte', () => {
    const lines = receiptLines(receipt);
    assert.equal(lines[0], 'Reçu de réception ENT-2026-000001');
    assert.ok(lines.includes('Remis par : Famille <Camara> & fils'));
    assert.ok(lines.includes('PAT-000001 — Registre « n°1 »'));
    assert.match(lines.at(-1), /ne vaut ni acquisition, ni dépôt, ni prêt/);
    const html = receiptHtml(receipt);
    assert.ok(html.includes('Famille &lt;Camara&gt; &amp; fils'));
    assert.ok(!html.includes('<Camara>'));
    assert.match(html, /class="mention">La remise des biens ne vaut ni acquisition/);
    assert.match(html, /<html lang="fr">/);
    assert.ok(!receiptHtml({ ...receipt, biens: [] }).includes('<li>'));
    assert.match(receiptLines({ ...receipt, biens: [] }).join('\n'), /Aucun bien encore enregistré/);
});

test('Date de registre : jamais plus de précision que le registre n’en donne', () => {
    const parse = text => parseRepriseDate(text);
    assert.deepEqual(parse('').champs, {});
    assert.deepEqual(parse('  inconnue ').champs, { precisionDate: 'INCONNUE' });
    assert.deepEqual(parse('Sans date').champs, { precisionDate: 'INCONNUE' });
    assert.deepEqual(parse('1930').champs, { precisionDate: 'ANNEE', dateDebut: '1930-01-01', dateFin: '1930-12-31' });
    assert.deepEqual(parse('1925-1935').champs, { precisionDate: 'ANNEE', dateDebut: '1925-01-01', dateFin: '1935-12-31' });
    assert.match(parse('1935-1925').error, /précède/);
    assert.deepEqual(parse('vers 1930').champs, { precisionDate: 'ESTIMEE', dateDebut: '1930-01-01', dateFin: '1930-12-31', dateTexte: 'vers 1930' });
    assert.match(parse('vers 1930').warning, /source/);
    assert.deepEqual(parse('années 1930').champs, { precisionDate: 'DECENNIE', dateDebut: '1930-01-01', dateFin: '1939-12-31' });
    assert.deepEqual(parse('1930s').champs, { precisionDate: 'DECENNIE', dateDebut: '1930-01-01', dateFin: '1939-12-31' });
    assert.deepEqual(parse('12/03/1952').champs, { precisionDate: 'EXACTE', dateDebut: '1952-03-12', dateFin: '1952-03-12' });
    assert.deepEqual(parse('1952-03-12').champs, { precisionDate: 'EXACTE', dateDebut: '1952-03-12', dateFin: '1952-03-12' });
    assert.match(parse('31/02/1952').error, /inexistante/);
    assert.match(parse('2026-13-40').error, /inexistante/);
    assert.deepEqual(parse('XIXe siècle').champs, { precisionDate: 'SIECLE', dateDebut: '1801-01-01', dateFin: '1900-12-31' });
    assert.deepEqual(parse('19e siècle').champs, { precisionDate: 'SIECLE', dateDebut: '1801-01-01', dateFin: '1900-12-31' });
    assert.deepEqual(parse('Ier siècle').champs, { precisionDate: 'SIECLE', dateDebut: '0001-01-01', dateFin: '0100-12-31' });
    // Ce qui n’est pas lisible est conservé tel quel, sans précision devinée, et reste à qualifier.
    const odd = parse('époque du roi Samory');
    assert.deepEqual(odd.champs, { dateTexte: 'époque du roi Samory' });
    assert.match(odd.warning, /à qualifier/);
    assert.match(parse('x'.repeat(300)).error, /trop longue/);
});

test('Les dates lues s’affichent comme dans le registre : siècle, décennie, année', () => {
    const show = text => { const c = parseRepriseDate(text).champs; return dateText(c.precisionDate ?? 'NON_RENSEIGNEE', c.dateDebut ?? null, c.dateFin ?? null, c.dateTexte ?? null); };
    assert.equal(show('XIXe siècle'), 'XIXe siècle');
    assert.equal(show('Ier siècle'), 'Ier siècle');
    assert.equal(show('années 1930'), 'années 1930');
    assert.equal(show('1930'), '1930');
    assert.equal(show('vers 1930'), 'vers 1930');
    assert.equal(show(''), 'Date non renseignée');
});

const categories = [{ code: 'REGISTRE', libelle: 'Registre', actif: true }, { code: 'CARTE_PLAN', libelle: 'Carte ou plan', actif: true }, { code: 'ANCIENNE', libelle: 'Ancienne', actif: false }];
const header = [...REPRISE_HEADERS];
const REGISTER = 'Registre d’inventaire de 1978';

test('Reprise : lecture d’un registre, anciennes références conservées, rien d’inventé', () => {
    const { rows, fatal } = parseRepriseTable([header,
        ['INV-001', 'Registre des naissances', 'Registre', '1952', 'Un registre.', 'Papier', '30 x 40 cm', 'A-12', 'Don de la famille Camara'],
        ['INV-002', 'Carte de la préfecture', 'carte ou plan', '', '', '', '', '', ''],
        ['', 'Sans numéro mais coté', 'REGISTRE', 'XIXe siècle', '', '', '', 'B-7', '']], categories, REGISTER);
    assert.equal(fatal, null);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0].errors, []);
    assert.deepEqual(rows[0].champs, { intitule: 'Registre des naissances', categorie: 'REGISTRE', natureOriginale: 'PHYSIQUE', precisionDate: 'ANNEE', dateDebut: '1952-01-01', dateFin: '1952-12-31',
        numeroInventaire: 'INV-001', anciennesReferences: [{ systeme: REGISTER, valeur: 'A-12' }], resume: 'Un registre.', support: 'Papier', dimensions: '30 x 40 cm', historiqueProvenance: 'Don de la famille Camara', provenanceStatut: 'PARTIELLE' });
    // Une catégorie se reconnaît par son libellé sans tenir compte de la casse ; une date absente reste absente (aucune précision n’est posée).
    assert.deepEqual(rows[1].champs, { intitule: 'Carte de la préfecture', categorie: 'CARTE_PLAN', natureOriginale: 'PHYSIQUE', numeroInventaire: 'INV-002' });
    assert.equal(rows[2].champs.numeroInventaire, undefined);
    assert.deepEqual(rows[2].champs.anciennesReferences, [{ systeme: REGISTER, valeur: 'B-7' }]);
    assert.equal(rows[0].line, 2);
});

test('Reprise : les lignes en erreur sont signalées avec leur raison et ne partent pas', () => {
    const { rows } = parseRepriseTable([header,
        ['INV-001', 'Registre', 'Registre', '', '', '', '', '', ''],
        ['inv-001', 'Doublon', 'Registre', '', '', '', '', '', ''],
        ['INV-003', '', 'Registre', '', '', '', '', '', ''],
        ['INV-004', 'Catégorie inconnue', 'Tableau', '', '', '', '', '', ''],
        ['INV-005', 'Catégorie retirée', 'Ancienne', '', '', '', '', '', ''],
        ['', 'Sans aucune référence', 'Registre', '', '', '', '', '', ''],
        ['INV-007', 'Date impossible', 'Registre', '31/02/1952', '', '', '', '', ''],
        ['INV-008', 'Date en lettres', 'Registre', 'époque coloniale', '', '', '', '', '']], categories, REGISTER);
    assert.equal(rows[0].champs !== null, true);
    assert.match(rows[1].errors[0], /déjà utilisé à la ligne 2/);
    assert.match(rows[2].errors[0], /Intitulé manquant/);
    assert.match(rows[3].errors[0], /Catégorie inconnue « Tableau »/);
    assert.match(rows[4].errors[0], /Catégorie inconnue/);
    assert.match(rows[5].errors[0], /numéro d’inventaire ou la cote/);
    assert.match(rows[6].errors[0], /inexistante/);
    assert.deepEqual(rows.slice(1, 7).map(r => r.champs), [null, null, null, null, null, null]);
    // Une date illisible ne fait pas échouer la ligne : elle est conservée en toutes lettres, à qualifier.
    assert.deepEqual(rows[7].champs.dateTexte, 'époque coloniale');
    assert.match(rows[7].warnings[0], /à qualifier/);
});

test('Reprise : colonnes obligatoires, fichier vide, trop de lignes et alias d’en-têtes', () => {
    assert.match(parseRepriseTable([['Intitulé', 'Catégorie'], ['x', 'Registre']], categories, REGISTER).fatal, /Numéro d’inventaire \(ou Cote ou ancienne référence\)/);
    assert.match(parseRepriseTable([['Numéro', 'Titre']], categories, REGISTER).fatal, /Catégorie/);
    assert.match(parseRepriseTable([header], categories, REGISTER).fatal, /aucun bien/);
    const many = [header, ...Array.from({ length: MAX_REPRISE_ROWS + 1 }, (_, i) => ['INV-' + i, 'Bien ' + i, 'Registre', '', '', '', '', '', ''])];
    assert.match(parseRepriseTable(many, categories, REGISTER).fatal, /limitée à 500/);
    const aliased = parseRepriseTable([['N° d’inventaire', 'Titre', 'Type', 'Datation'], ['I-1', 'Un registre', 'Registre', '1960']], categories, REGISTER);
    assert.equal(aliased.fatal, null);
    assert.equal(aliased.rows[0].champs.dateDebut, '1960-01-01');
    // Les lignes entièrement vides sont ignorées sans décaler les numéros de ligne.
    const blank = parseRepriseTable([header, ['', '', '', '', '', '', '', '', ''], ['I-2', 'Un bien', 'Registre', '', '', '', '', '', '']], categories, REGISTER);
    assert.equal(blank.rows.length, 1);
    assert.equal(blank.rows[0].line, 3);
});

test('Reprise : le libellé du lot qualifie les anciennes références, borné à 100 caractères', () => {
    const { rows } = parseRepriseTable([header, ['I-1', 'Un bien', 'Registre', '', '', '', '', 'A-1', '']], categories, 'R'.repeat(150));
    assert.equal(rows[0].champs.anciennesReferences[0].systeme.length, 100);
    assert.equal(parseRepriseTable([header, ['I-1', 'Un bien', 'Registre', '', '', '', '', 'A-1', '']], categories, '   ').rows[0].champs.anciennesReferences[0].systeme, 'Inventaire d’origine');
});

test('Modèle de reprise : classeur Excel valide avec les en-têtes et les catégories actives', () => {
    const bytes = repriseTemplate(categories);
    assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b);
    const text = Buffer.from(bytes).toString('latin1');
    assert.ok(text.includes('xl/worksheets/sheet1.xml'));
    assert.ok(text.includes('Registre,Carte ou plan'));
    assert.ok(!text.includes('Ancienne'));
});
