import test from 'node:test';
import assert from 'node:assert/strict';
import { STATE_LABELS, HANDLING_LABELS, URGENCY_LABELS, CONTEXT_LABELS, CONTEXT_CHOICES, TREATMENT_TYPE_LABELS, TREATMENT_STATUS_LABELS, ATTENTION_LABELS, ATTENTION_NEXT_STEPS, stateLabel, attentionLabel, statusLabel,
    stateTone, handlingTone, worstAttention, attentionTone, alterationLabels, handlingChoices, emptyReportForm, reportProblems, reportBody, emptyProposalForm, proposalOf, proposalProblems, proposalBody,
    treatmentTransitionLabel, transitionNeeds, needsForm, emptyTransitionForm, treatmentTransitionProblems, treatmentBody, treatmentDays } from '../.test-build/conservation.js';
import { ETAT_LABELS, DISPONIBILITE_LABELS } from '../.test-build/heritageAssets.js';

const TODAY = '2026-10-04';
const form = (patch = {}) => ({ ...emptyReportForm('PERIODIQUE'), ...patch });

test('États, manipulations et urgences ont leurs libellés, et ceux des états du bien restent cohérents', () => {
    assert.equal(STATE_LABELS.INTERVENTION_REQUISE, 'Intervention requise');
    assert.equal(HANDLING_LABELS.INTERDITE, 'Manipulation interdite');
    assert.equal(URGENCY_LABELS.A_PLANIFIER, 'À planifier');
    assert.equal(CONTEXT_LABELS.AVANT_MOUVEMENT, 'Avant un mouvement');
    for (const state of Object.keys(STATE_LABELS)) assert.equal(STATE_LABELS[state], ETAT_LABELS[state]);
    assert.equal(DISPONIBILITE_LABELS.EN_RESTAURATION, 'En restauration');
    assert.equal(stateLabel(null), 'Non évalué');
    assert.equal(stateLabel('FRAGILE'), 'Fragile');
    assert.equal(statusLabel('EN_COURS'), 'En cours');
    assert.equal(statusLabel(null), '—');
    assert.equal(attentionLabel('INTERVENTION_REQUISE'), 'À traiter');
    assert.equal(attentionLabel('INCONNU'), 'INCONNU');
    assert.equal(TREATMENT_TYPE_LABELS.DESACIDIFICATION, 'Désacidification');
    assert.equal(TREATMENT_STATUS_LABELS.REFUSE, 'Refusé');
});

test('Le constat après traitement n’est pas proposé parmi les circonstances libres', () => {
    assert.ok(!CONTEXT_CHOICES.includes('APRES_TRAITEMENT'));
    assert.ok(CONTEXT_CHOICES.includes('AVANT_TRAITEMENT'));
    assert.equal(CONTEXT_CHOICES.length, Object.keys(CONTEXT_LABELS).length - 1);
});

test('Tons : un état stable est conforme, une intervention requise est une alerte', () => {
    assert.equal(stateTone('STABLE'), 'ok'); assert.equal(stateTone('FRAGILE'), 'warn'); assert.equal(stateTone('INTERVENTION_REQUISE'), 'bad'); assert.equal(stateTone(null), '');
    assert.equal(handlingTone('LIBRE'), 'ok'); assert.equal(handlingTone('PRECAUTIONS'), 'warn'); assert.equal(handlingTone('INTERDITE'), 'bad'); assert.equal(handlingTone(null), '');
});

test('Le point d’attention le plus grave passe en premier', () => {
    assert.equal(worstAttention([]), null);
    assert.equal(worstAttention(['SANS_CONSTAT', 'FRAGILE']), 'FRAGILE');
    assert.equal(worstAttention(['CONSTAT_ANCIEN', 'TRAITEMENT_EN_COURS', 'INTERVENTION_REQUISE']), 'INTERVENTION_REQUISE');
    assert.equal(attentionTone('INTERVENTION_REQUISE'), 'bad');
    assert.equal(attentionTone('TRAITEMENT_A_VALIDER'), 'warn');
    assert.equal(attentionTone('SANS_CONSTAT'), '');
    for (const a of Object.keys(ATTENTION_LABELS)) assert.ok(ATTENTION_NEXT_STEPS[a], a);
});

test('Les altérations se lisent par leur libellé, un code retiré du référentiel reste lisible', () => {
    const refs = [{ code: 'DECHIRURE', libelle: 'Déchirure' }, { code: 'TACHE', libelle: 'Tache' }];
    assert.deepEqual(alterationLabels(['TACHE', 'DECHIRURE', 'ANCIEN_CODE'], refs), ['Tache', 'Déchirure', 'ANCIEN_CODE']);
    assert.deepEqual(alterationLabels([], refs), []);
});

test('Une intervention requise n’est jamais en manipulation libre', () => {
    assert.deepEqual(handlingChoices('INTERVENTION_REQUISE'), ['PRECAUTIONS', 'INTERDITE']);
    assert.deepEqual(handlingChoices('STABLE'), ['LIBRE', 'PRECAUTIONS', 'INTERDITE']);
    assert.deepEqual(handlingChoices(''), ['LIBRE', 'PRECAUTIONS', 'INTERDITE']);
});

test('Constat d’état : état, manipulation, altération, observations et traitement recommandé', () => {
    assert.ok(reportProblems(form({}), TODAY).length >= 3);
    assert.deepEqual(reportProblems(form({ etat: 'STABLE', manipulation: 'LIBRE', observations: 'État général satisfaisant' }), TODAY), []);
    assert.match(reportProblems(form({ etat: 'FRAGILE', manipulation: 'PRECAUTIONS', observations: 'Pages fragiles en bordure' }), TODAY)[0], /au moins une altération/);
    assert.deepEqual(reportProblems(form({ etat: 'FRAGILE', manipulation: 'PRECAUTIONS', alterations: ['TACHE'], observations: 'Pages fragiles en bordure' }), TODAY), []);
    const needs = form({ etat: 'INTERVENTION_REQUISE', manipulation: 'LIBRE', alterations: ['DECHIRURE'], observations: 'Déchirure traversante du dos' });
    assert.equal(reportProblems(needs, TODAY).length, 2);
    assert.match(reportProblems({ ...needs, manipulation: 'INTERDITE' }, TODAY)[0], /traitement recommandé/);
    assert.deepEqual(reportProblems({ ...needs, manipulation: 'INTERDITE', traitementRecommande: 'Consolidation par papier japon' }, TODAY), []);
    assert.match(reportProblems(form({ etat: 'STABLE', manipulation: 'LIBRE', observations: 'court' }), TODAY)[0], /au moins 10 caractères/);
    assert.match(reportProblems(form({ etat: 'STABLE', manipulation: 'LIBRE', observations: 'État général satisfaisant', constateLe: '2026-10-05' }), TODAY)[0], /futur/);
    assert.match(reportProblems(form({ contexte: '', etat: 'STABLE', manipulation: 'LIBRE', observations: 'État général satisfaisant' }), TODAY)[0], /circonstances/);
    // Le constat d'après traitement a son contexte imposé.
    assert.deepEqual(reportProblems(form({ contexte: '', etat: 'STABLE', manipulation: 'PRECAUTIONS', observations: 'Stable après la consolidation' }), TODAY, true), []);
});

test('Corps du constat : les champs vides sont omis, le constat d’après traitement n’envoie pas de contexte', () => {
    const full = form({ etat: 'FRAGILE', manipulation: 'PRECAUTIONS', urgence: 'A_PLANIFIER', alterations: ['TACHE'], observations: '  Pages fragiles en bordure  ', traitementRecommande: '  ', constateLe: '2026-09-01', documentIds: ['d1'] });
    assert.deepEqual(reportBody(full), { etat: 'FRAGILE', manipulation: 'PRECAUTIONS', urgence: 'A_PLANIFIER', alterations: ['TACHE'], observations: 'Pages fragiles en bordure', contexte: 'PERIODIQUE', constateLe: '2026-09-01', documentIds: ['d1'] });
    assert.deepEqual(reportBody(form({ etat: 'STABLE', manipulation: 'LIBRE', observations: 'État général satisfaisant' }), true), { etat: 'STABLE', manipulation: 'LIBRE', urgence: 'AUCUNE', alterations: [], observations: 'État général satisfaisant' });
});

test('Proposition de traitement : intitulé, nature, diagnostic et traitement prévu écrits', () => {
    const f = patch => ({ ...emptyProposalForm(), ...patch });
    assert.equal(proposalProblems(f({})).length, 4);
    assert.deepEqual(proposalProblems(f({ intitule: 'Consolidation du dos', typeTraitement: 'CONSOLIDATION', diagnostic: 'Déchirure traversante du dos', traitementPrevu: 'Consolidation par papier japon' })), []);
    assert.equal(proposalProblems(f({ intitule: '  ', typeTraitement: 'NETTOYAGE', diagnostic: 'Salissure générale', traitementPrevu: 'Nettoyage à sec complet' })).length, 1);
    assert.deepEqual(proposalBody(f({ intitule: '  Consolidation  ', typeTraitement: 'CONSOLIDATION', diagnostic: ' Déchirure du dos ', traitementPrevu: ' Papier japon ' })),
        { intitule: 'Consolidation', typeTraitement: 'CONSOLIDATION', diagnostic: 'Déchirure du dos', traitementPrevu: 'Papier japon' });
    assert.deepEqual(proposalOf({ intitule: 'T', typeTraitement: 'RELIURE', diagnostic: 'D', traitementPrevu: 'P', statut: 'PROPOSE' }), { intitule: 'T', typeTraitement: 'RELIURE', diagnostic: 'D', traitementPrevu: 'P' });
});

test('Passages d’un traitement : libellé et ce qu’ils demandent en plus du clic', () => {
    assert.equal(treatmentTransitionLabel('VALIDE'), 'Valider le traitement');
    assert.equal(treatmentTransitionLabel('EN_COURS'), 'Démarrer le traitement');
    assert.equal(treatmentTransitionLabel('TERMINE'), 'Terminer le traitement');
    const option = (vers, extra = {}) => ({ vers, motifRequis: false, intervenantRequis: false, constatRequis: false, ...extra });
    assert.equal(needsForm(option('VALIDE')), false);
    assert.equal(needsForm(option('REFUSE', { motifRequis: true })), true);
    assert.deepEqual(transitionNeeds(option('EN_COURS', { intervenantRequis: true })), { texte: false, texteLabel: 'Motif', intervenant: true, constat: false });
    assert.deepEqual(transitionNeeds(option('TERMINE', { motifRequis: true, constatRequis: true })), { texte: true, texteLabel: 'Compte rendu du traitement', intervenant: false, constat: true });
});

test('Terminer un traitement : compte rendu et constat d’état après traitement', () => {
    const option = { vers: 'TERMINE', motifRequis: true, intervenantRequis: false, constatRequis: true };
    const blank = emptyTransitionForm();
    assert.ok(treatmentTransitionProblems(option, blank, TODAY).length >= 4);
    const ok = { ...blank, texte: 'Consolidation faite, traitement fongicide appliqué', constat: { ...blank.constat, etat: 'STABLE', manipulation: 'PRECAUTIONS', observations: 'Stable après consolidation du dos' } };
    assert.deepEqual(treatmentTransitionProblems(option, ok, TODAY), []);
    assert.match(treatmentTransitionProblems(option, { ...ok, texte: 'fini' }, TODAY)[0], /Compte rendu du traitement/);
    assert.deepEqual(treatmentBody('TERMINE', 7, ok, option), { vers: 'TERMINE', expectedVersion: 7, texte: 'Consolidation faite, traitement fongicide appliqué',
        constat: { etat: 'STABLE', manipulation: 'PRECAUTIONS', urgence: 'AUCUNE', alterations: [], observations: 'Stable après consolidation du dos' } });
});

test('Démarrer dit qui réalise ; valider n’envoie rien de plus que la version', () => {
    const start = { vers: 'EN_COURS', motifRequis: false, intervenantRequis: true, constatRequis: false };
    assert.equal(treatmentTransitionProblems(start, emptyTransitionForm(), TODAY).length, 1);
    assert.deepEqual(treatmentTransitionProblems(start, { ...emptyTransitionForm(), intervenant: 'Atelier de restauration' }, TODAY), []);
    assert.deepEqual(treatmentBody('EN_COURS', 3, { ...emptyTransitionForm(), intervenant: ' Atelier de restauration ' }, start), { vers: 'EN_COURS', expectedVersion: 3, intervenant: 'Atelier de restauration' });
    assert.deepEqual(treatmentBody('VALIDE', 2, { ...emptyTransitionForm(), texte: 'ignoré' }, { motifRequis: false, intervenantRequis: false, constatRequis: false }), { vers: 'VALIDE', expectedVersion: 2 });
    assert.deepEqual(treatmentBody('REFUSE', 2, { ...emptyTransitionForm(), texte: ' Trop lourd pour ce volume ' }, { motifRequis: true, intervenantRequis: false, constatRequis: false }), { vers: 'REFUSE', expectedVersion: 2, texte: 'Trop lourd pour ce volume' });
});

test('Durée d’un traitement : en jours, ou rien tant qu’il n’est pas commencé', () => {
    assert.equal(treatmentDays({ debutLe: null, finLe: null }), null);
    assert.equal(treatmentDays({ debutLe: '2026-10-01T09:00:00Z', finLe: '2026-10-11T09:00:00Z' }), 10);
    assert.equal(treatmentDays({ debutLe: '2026-10-01T09:00:00Z', finLe: null }, new Date('2026-10-04T10:00:00Z')), 3);
});
