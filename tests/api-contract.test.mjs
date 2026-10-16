import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { compareContract, DEFAULT_CONTRACT } from '../scripts/check-contract.mjs';

// Le contrat vit dans le dépôt du serveur (docs/api-contrat.json, régénéré par ApiContractSnapshotTest). Sans lui (dépôt serveur absent), le test est ignoré ; indiquer un autre
// emplacement avec SNAE_API_CONTRACT.
const contract = process.env.SNAE_API_CONTRACT ?? DEFAULT_CONTRACT;

test('les types de réponse du frontend correspondent à ce que le serveur envoie', { skip: !existsSync(contract) && 'contrat du serveur introuvable', timeout: 120_000 }, () => {
    const result = compareContract(contract);
    assert.ok(result.compared > 200, `assez de réponses comparées : ${result.compared}`);
    const blocking = result.findings.filter(f => f.kind === 'manquant' || f.kind === 'forme');
    assert.deepEqual(blocking.map(f => `${f.call} ${f.detail} [${f.where}]`), [], 'une propriété obligatoire du frontend que le serveur n’envoie pas, ou une forme (liste/objet) différente');
});
