import type { ArchiveBrowseRow } from '../../src/api/archives';
export function browseFixture(rows:unknown[], path:string, relations:unknown[]=[]){
    const all=rows as ArchiveBrowseRow[], params=new URLSearchParams(path.split('?')[1]);
    const parent=params.get('parentId'), page=Number(params.get('page')||0);
    const selected=all.filter(r=>('parentId' in r.input?r.input.parentId:null)==parent);
    return {items:selected.slice(page*20,page*20+20).map(row=>({row,ancestors:[],hasChildren:all.some(r=>'parentId' in r.input&&r.input.parentId===row.id),
        producerKnown:'producerId' in row.input&&!!(row.input.producerId||all.some(r=>'producerId' in r.input&&r.id===row.input.parentId&&r.input.producerId)),
        relationCount:(relations as {input:{sourceId:string;targetId:string}}[]).filter(r=>r.input.sourceId===row.id||r.input.targetId===row.id).length})),
        page,size:20,total:selected.length,hasMore:(page+1)*20<selected.length,searching:false};
}
