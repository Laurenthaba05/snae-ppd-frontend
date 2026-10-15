import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyEnrichment,dateBounds,enrichmentProblems,enrichedDetails,safeReferenceUri } from '../.test-build/archiveEnrichment.js';
import { emptyRightForm,rightProblems,rightBody } from '../.test-build/preservationPlanning.js';

test('Dates partielles, années bissextiles et bornes ouvertes',()=>{
    assert.deepEqual(dateBounds('1958'),['1958-01-01','1958-12-31']);
    assert.deepEqual(dateBounds('2000-02'),['2000-02-01','2000-02-29']);
    for(const value of ['0000','2025-02-29','2026-13','2026-01-00']) assert.equal(dateBounds(value),null);
    assert.equal(enrichmentProblems({...emptyEnrichment(),dates:[{type:'CREATION',start:'1960',end:'1958',calendar:'GREGORIEN',certainty:'EXACTE'}]}).length,1);
});
test('Identifiants multiples sans doublons ni URI exécutable',()=>{
    assert.equal(safeReferenceUri('javascript:alert(1)'),false);
    assert.equal(safeReferenceUri('https://user:secret@example.org'),false);
    assert.equal(safeReferenceUri('urn:archive:1'),true);
    const x={type:'cote',value:'AA/1'};
    assert.ok(enrichmentProblems({...emptyEnrichment(),identifiers:[x,{...x,type:' COTE '}]}).some(p=>p.includes('répété')));
});
test('Le calendrier non grégorien conserve son expression sans fausse normalisation',()=>{
    const date={type:'CREATION',expression:'vers 1440',calendar:'HEGIRIEN',certainty:'ESTIMEE'};
    assert.deepEqual(enrichmentProblems({...emptyEnrichment(),dates:[date]}),[]);
    assert.ok(enrichmentProblems({...emptyEnrichment(),dates:[{...date,start:'1440'}]}).length);
});
test('La validation utilise les enrichissements et préserve les valeurs historiques',()=>{
    const enrichment={...emptyEnrichment(),dates:[{type:'CREATION',start:'1958',calendar:'GREGORIEN',certainty:'EXACTE'}],extents:[{quantity:'12.5',unit:'ML',portion:'WHOLE'}]};
    assert.deepEqual(enrichedDetails({details:{},enrichment}),{dateLabel:'1958',extentQuantity:'12.5',extentUnit:'ML'});
    assert.equal(enrichedDetails({details:{dateLabel:'Historique'},enrichment}).dateLabel,'Historique');
});
test('Un droit conditionnel ne devient jamais une autorisation sans condition',()=>{
    const form={...emptyRightForm('2026-01-01'),basis:'DROIT_AUTEUR',act:'DIFFUSER',decision:'CONDITIONAL',granted:true};
    assert.ok(rightProblems(form).some(p=>p.includes('conditions')));
    assert.equal(rightBody({...form,restriction:'Accord écrit'}).granted,false);
});
