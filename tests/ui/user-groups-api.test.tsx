import { expect, it, vi } from 'vitest';
import { IamApi } from '../../src/api/iam';

const uid='10000000-0000-4000-8000-000000000001';
const group=(i:number)=>({id:'cc000000-0000-4000-8000-'+i.toString(16).padStart(12,'0'),nom:'Groupe '+i});
it('charge les 101 appartenances du compte, en transmettant le signal et les pages',async()=>{
    const signal=new AbortController().signal;
    const request=vi.fn(async(path:string)=>{
        const page=Number(new URL('http://local'+path).searchParams.get('page'));
        return {items:page===0?Array.from({length:100},(_,i)=>group(i)):[group(100)],page,size:100,hasMore:page===0};
    });
    const api=new IamApi({request} as never);
    expect(await api.allUserGroups(uid,signal)).toHaveLength(101);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]?.[0]).toContain('page=1');
    expect(request).toHaveBeenLastCalledWith(expect.any(String),{signal});
});
it('les sélecteurs atteignent le 501e groupe',async()=>{
    const request=vi.fn(async(path:string)=>{
        const page=Number(new URL('http://local'+path).searchParams.get('page'));
        return {items:Array.from({length:page===5?1:100},(_,i)=>group(page*100+i)),page,size:100,hasMore:page<5};
    });
    expect(await new IamApi({request} as never).allGroups(null)).toHaveLength(501);
});
it('refuse une pagination répétée ou vide au lieu de livrer une liste incomplète',async()=>{
    const request=vi.fn(async()=>({items:[group(1)],page:0,size:100,hasMore:true}));
    await expect(new IamApi({request} as never).allGroups(null)).rejects.toThrow('incohérente');
    request.mockResolvedValue({items:[],page:0,size:100,hasMore:true});
    await expect(new IamApi({request} as never).allUserGroups(uid)).rejects.toThrow('incohérente');
});
