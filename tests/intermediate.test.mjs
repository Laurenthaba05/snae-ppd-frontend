import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BLOCKER_TEXT, MAX_LINES, blockerText, documentInfoText, emptyPassage, isSelectable, passageBody, passageHtml, passageProblems, phaseStateText, selectionText, volumeText
} from '../.test-build/intermediate.js';

const day = iso => iso.slice(0, 10);

test('Les obstacles se disent en français, un code inconnu reste lisible', () => {
    for (const code of Object.keys(BLOCKER_TEXT)) assert.ok(!/^[A-Z_]+$/.test(blockerText(code)), code);
    assert.match(blockerText('PHASE_NOT_REACHED'), /pas terminée/);
    assert.equal(blockerText('UN_CODE_NOUVEAU'), 'Un code nouveau.');
    assert.ok(isSelectable({ blockers: [] })); assert.ok(!isSelectable({ blockers: ['PHASE_NOT_REACHED'] }));
});

test('Le volume et la sélection se disent sans pluriel fautif', () => {
    assert.equal(volumeText(0, 0), 'aucun document');
    assert.match(volumeText(2, 2048), /^2 documents \(.*Ko\)$/);
    const candidates = [{ eventId: 'a', totalBytes: 1024 }, { eventId: 'b', totalBytes: 1024 }];
    assert.equal(selectionText(candidates, new Set()), 'Aucun document choisi.');
    assert.match(selectionText(candidates, new Set(['a'])), /^1 document \(.*\) choisi\.$/);
    assert.match(selectionText(candidates, new Set(['a', 'b'])), /^2 documents \(.*\) choisis\.$/);
});

test('La saisie d’un passage exige un lieu, un responsable et des documents', () => {
    const ok = { ...emptyPassage(), place: 'Centre des archives intermédiaires, magasin 3', manager: 'Mme Camara, archiviste' };
    assert.deepEqual(passageProblems(ok, 3), []);
    assert.match(passageProblems({ ...ok, place: ' ' }, 3)[0], /lieu/);
    assert.match(passageProblems({ ...ok, manager: '' }, 3)[0], /responsable/);
    assert.match(passageProblems(ok, 0)[0], /au moins un document/);
    assert.match(passageProblems(ok, MAX_LINES + 1)[0], /500 documents au plus/);
    assert.match(passageProblems({ ...ok, place: 'x'.repeat(301) }, 1)[0], /300/);
    assert.match(passageProblems({ ...ok, versementReference: 'x'.repeat(256) }, 1)[0], /255/);
});

test('Le corps du passage vide ce qui n’est pas saisi et garde les échéances dans l’ordre', () => {
    const body = passageBody({ place: ' Magasin 3 ', manager: ' Mme Camara ', versementReference: ' ', observations: '' }, 'inst1', ['e2', 'e1']);
    assert.deepEqual(body, { institutionId: 'inst1', place: 'Magasin 3', manager: 'Mme Camara', versementReference: null, observations: null, eventIds: ['e2', 'e1'] });
});

test('L’état de la phase et la fiche d’un document semi-actif se disent en une phrase', () => {
    assert.equal(phaseStateText({ phaseReached: true }, day, '2025-05-12'), 'Phase courante terminée le 2025-05-12.');
    assert.equal(phaseStateText({ phaseReached: false }, day, '2027-01-01'), 'Passage prévu le 2027-01-01.');
    assert.equal(documentInfoText({ place: 'Magasin 3', manager: 'Mme Camara', phaseDate: '2025-05-12', dueDate: '2030-05-12' }, day),
        'En archives intermédiaires depuis le 2025-05-12 : Magasin 3, sous la garde de Mme Camara. Conservé jusqu’à l’échéance du 2030-05-12, où le sort final s’applique.');
});

test('Le passage imprimable reprend le lieu, le responsable et chaque document, sans laisser passer de balise', () => {
    const passage = {
        summary: { id: 'p1', reference: 'PI-2026-000001', institutionId: 'i1', place: 'Magasin <3>', manager: 'Mme "Camara"', versementReference: 'VERS-2026-04', documentCount: 1, totalBytes: 2048, createdById: 'u1', createdAt: '2026-10-10T08:00:00Z' },
        observations: 'Lot <annuel>',
        lines: [{ rank: 1, documentId: 'd1', reference: 'DOC-1', title: 'Registre <1985> & "annexes"', baseDate: '1985-01-01', phaseDate: '1990-01-01', dueDate: '1995-01-01', rule: 'Registres', fileCount: 2, totalBytes: 2048 }]
    };
    const html = passageHtml(passage, { institution: 'Ministère de test', createdBy: 'Aïcha <Camara>', date: iso => iso.slice(0, 10), day });
    assert.ok(html.includes('PI-2026-000001') && html.includes('Ministère de test') && html.includes('VERS-2026-04') && html.includes('DOC-1'));
    assert.ok(html.includes('Magasin &lt;3&gt;') && html.includes('Mme &quot;Camara&quot;') && html.includes('Lot &lt;annuel&gt;') && html.includes('Registre &lt;1985&gt; &amp; &quot;annexes&quot;') && html.includes('Aïcha &lt;Camara&gt;'));
    assert.ok(!html.includes('<script') && !html.includes('<3>') && !html.includes('<annuel>') && !html.includes('<1985>'));
});
