import test from 'node:test';
import assert from 'node:assert/strict';
import { accountInstitution, creationInstitution } from '../.test-build/creationScope.js';

const INST_A = '00000000-0000-4000-8000-0000000000a1';
const INST_B = '00000000-0000-4000-8000-0000000000b2';

const grant = (over = {}) => ({ permission: 'IAM_DEPARTMENT_MANAGE', roleCode: 'AUTRE', scope: 'INSTITUTION', institutionId: INST_A, departmentId: null, delegationId: null, expiresAt: null, ...over });
const me = (institutionId, grants) => ({ user: { id: 'u1', status: 'ACTIF', accountType: 'USER', institutionId, departmentId: null, scope: institutionId ? 'INSTITUTION' : 'NATIONAL' }, grants });
const platformAdmin = () => me(null, [grant({ roleCode: 'SNAE_PLATFORM_ADMIN', scope: 'NATIONAL', institutionId: null })]);
const institutionAccount = () => me(INST_A, [grant()]);

test('Un compte d’institution ne crée que dans son institution', () => {
    assert.equal(accountInstitution(institutionAccount()), INST_A);
    assert.equal(creationInstitution(institutionAccount(), {}), INST_A);
    assert.equal(creationInstitution(institutionAccount(), { institutionId: null, departmentId: null }), INST_A);
});

test('L’administration centrale choisit librement tant qu’elle ne travaille dans aucune institution', () => {
    assert.equal(accountInstitution(platformAdmin()), null);
    assert.equal(creationInstitution(platformAdmin(), {}), null);
    assert.equal(creationInstitution(platformAdmin(), { institutionId: null, departmentId: null }), null);
});

test('Travailler dans une institution lie la création à elle, même pour l’administration centrale', () => {
    assert.equal(creationInstitution(platformAdmin(), { institutionId: INST_B, departmentId: null }), INST_B);
    assert.equal(creationInstitution(institutionAccount(), { institutionId: INST_B, departmentId: null }), INST_B);
});

test('Sans compte, ou sans institution de rattachement, rien n’est imposé', () => {
    assert.equal(accountInstitution(null), null);
    assert.equal(creationInstitution(null, {}), null);
    assert.equal(accountInstitution(me(null, [grant({ scope: 'NATIONAL', institutionId: null })])), null);
});

test('Un rôle d’administration plateforme délégué ou échu ne rend pas le compte central', () => {
    const delegated = me(INST_A, [grant({ roleCode: 'SNAE_PLATFORM_ADMIN', scope: 'NATIONAL', institutionId: null, delegationId: 'd1' })]);
    assert.equal(accountInstitution(delegated), INST_A);
    const expired = me(INST_A, [grant({ roleCode: 'SNAE_PLATFORM_ADMIN', scope: 'NATIONAL', institutionId: null, expiresAt: '2020-01-01T00:00:00Z' })]);
    assert.equal(accountInstitution(expired), INST_A);
});
