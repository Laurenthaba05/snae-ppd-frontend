import test from 'node:test';
import assert from 'node:assert/strict';
import { addMemberCommand, archiveGroupCommand, createGroupCommand, defaultGroupFor, groupScope, groupsForNewAccount, memberName, parseMemberPage, removeMemberCommand, updateGroupCommand } from '../.test-build/userGroups.js';
import { entityCommand } from '../.test-build/commands.js';

// Les groupes d'utilisateurs : chaque compte humain entre dans un groupe dès sa création ; un groupe range des comptes, il n'accorde aucun droit.
const INSTITUTION = '20000000-0000-4000-8000-000000000001';
const OTHER = '20000000-0000-4000-8000-000000000002';
const group = (code, institutionId, extra = {}) => ({ id: 'g-' + code, institutionId, code, nom: 'Groupe ' + code, description: null, defaultGroup: false, status: 'ACTIF', version: 0, memberCount: 0, ...extra });

test('un membre se nomme par son prénom et son nom, sinon son adresse, jamais par un identifiant', () => {
    assert.equal(memberName({ prenom: 'Aïssatou', nom: 'Diallo', email: 'a@example.test' }), 'Aïssatou Diallo');
    assert.equal(memberName({ prenom: null, nom: 'Diallo', email: null }), 'Diallo');
    assert.equal(memberName({ prenom: null, nom: null, email: 'a@example.test' }), 'a@example.test');
    assert.equal(memberName({ prenom: null, nom: null, email: null }), 'Compte sans nom');
});

test('la portée d’un groupe est dite en mots', () => {
    assert.equal(groupScope({ institutionId: null }), 'National');
    assert.equal(groupScope({ institutionId: INSTITUTION }), 'Institution');
});

test('à la création, seuls les groupes actifs de l’institution du compte sont proposés', () => {
    const groups = [group('A', INSTITUTION), group('B', INSTITUTION, { status: 'ARCHIVE' }), group('C', OTHER), group('GENERAL', null, { defaultGroup: true })];
    assert.deepEqual(groupsForNewAccount(groups, INSTITUTION).map(g => g.code), ['A']);
    assert.deepEqual(groupsForNewAccount(groups, null), []);
    assert.deepEqual(groupsForNewAccount(groups, undefined), []);
});

test('sans choix, le compte entre dans le groupe par défaut de son institution, sinon dans le groupe national par défaut', () => {
    const national = group('GENERAL', null, { defaultGroup: true });
    const own = group('DEF', INSTITUTION, { defaultGroup: true });
    assert.equal(defaultGroupFor([national, own], INSTITUTION).code, 'DEF');
    assert.equal(defaultGroupFor([national, own], OTHER).code, 'GENERAL');
    assert.equal(defaultGroupFor([national, own], null).code, 'GENERAL');
    assert.equal(defaultGroupFor([own], OTHER), null);
    assert.equal(defaultGroupFor([group('DEF', INSTITUTION, { defaultGroup: true, status: 'ARCHIVE' }), national], INSTITUTION).code, 'GENERAL');
});

test('la création d’un groupe normalise le code et refuse un code ou un intitulé invalide', () => {
    assert.deepEqual(createGroupCommand({ code: ' equipe-1 ', nom: ' Équipe 1 ', description: '', defaultGroup: 'true' }, INSTITUTION),
        { institutionId: INSTITUTION, code: 'EQUIPE-1', nom: 'Équipe 1', description: null, defaultGroup: true });
    assert.equal(createGroupCommand({ code: 'NAT', nom: 'National' }, null).institutionId, null);
    assert.throws(() => createGroupCommand({ code: '1abc', nom: 'x' }, null), /code/i);
    assert.throws(() => createGroupCommand({ code: 'OK', nom: '   ' }, null), /Texte requis/);
    assert.throws(() => createGroupCommand({ code: 'OK', nom: 'x' }, 'pas-un-uuid'), /UUID/);
});

test('modifier ou archiver un groupe exige la version du serveur et un motif', () => {
    assert.deepEqual(updateGroupCommand({ version: 3 }, { nom: 'Nouveau', description: 'Texte', defaultGroup: 'false', reason: 'Renommage' }),
        { expectedVersion: 3, nom: 'Nouveau', description: 'Texte', defaultGroup: false, reason: 'Renommage' });
    assert.throws(() => updateGroupCommand({ version: 3 }, { nom: 'Nouveau', reason: ' ' }), /Texte requis/);
    assert.throws(() => updateGroupCommand({ version: -1 }, { nom: 'Nouveau', reason: 'x' }), /Version/);
    assert.deepEqual(archiveGroupCommand({ version: 0 }, { reason: 'Équipe dissoute' }), { expectedVersion: 0, reason: 'Équipe dissoute' });
    assert.throws(() => archiveGroupCommand({ version: 0 }, {}), /Texte requis/);
});

test('ajouter ou retirer un membre porte le motif ; le compte est un UUID', () => {
    const user = '10000000-0000-4000-8000-000000000003';
    assert.deepEqual(addMemberCommand(user, { motif: 'Équipe projet' }), { utilisateurId: user, motif: 'Équipe projet' });
    assert.throws(() => addMemberCommand('x', { motif: 'm' }), /UUID/);
    assert.throws(() => addMemberCommand(user, {}), /Texte requis/);
    assert.deepEqual(removeMemberCommand({ reason: 'Changement d’équipe' }), { reason: 'Changement d’équipe' });
    assert.throws(() => removeMemberCommand({ reason: '' }), /Texte requis/);
});

test('la création d’un compte humain porte le groupe choisi, sans rien changer quand on n’en choisit pas', () => {
    const base = { scope: 'INSTITUTION', typeCompte: 'USER', institutionId: INSTITUTION, ssoId: 'sub-1', nom: 'Diallo' };
    const without = entityCommand('users', base);
    assert.equal('groupId' in without, false);
    const group = '60000000-0000-4000-8000-000000000009';
    assert.equal(entityCommand('users', { ...base, groupId: group }).groupId, group);
    assert.equal('groupId' in entityCommand('users', { ...base, groupId: '' }), false);
    // un compte technique n'est dans aucun groupe : un groupe resté dans le brouillon n'est pas envoyé
    assert.equal('groupId' in entityCommand('users', { scope: 'SERVICE', typeCompte: 'SERVICE', ssoId: 'svc-1', groupId: group }), false);
    assert.throws(() => entityCommand('users', { ...base, groupId: 'pas-un-uuid' }), /UUID/);
});

test('une page de membres se reconnaît par userId ; le contrôle commun des pages (qui exige id) ne leur convient pas', () => {
    const user = '10000000-0000-4000-8000-0000000000bb';
    const page = { items: [{ userId: user, nom: 'Diallo', prenom: null, email: 'a@example.test', addedAt: '2026-10-01T09:00:00Z' }], page: 0, size: 20, hasMore: false };
    assert.equal(parseMemberPage(page), page);
    assert.throws(() => parseMemberPage({ ...page, items: [{ ...page.items[0], userId: 'pas-un-uuid' }] }), /Identifiant/);
    assert.throws(() => parseMemberPage({ ...page, items: [{ id: user, nom: 'Diallo', addedAt: 'x' }] }), /Identifiant/);
    assert.throws(() => parseMemberPage({ ...page, items: [{ ...page.items[0], addedAt: 5 }] }), /Identifiant/);
    assert.throws(() => parseMemberPage({ ...page, size: 500 }), /Page API invalide/);
    assert.throws(() => parseMemberPage(null), /Page API invalide/);
});
