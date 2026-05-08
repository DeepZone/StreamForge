import { useEffect, useState } from 'react';
import { apiBase } from '../../api/client';

export default function AdminHealth(){
  const [data,setData]=useState<any>(null);
  useEffect(()=>{fetch(`${apiBase}/api/admin/health`,{credentials:'include'}).then(r=>r.json()).then(setData).catch(()=>setData({error:true}));},[]);
  if(!data) return <div className='p-6'>Loading...</div>;
  return <div className='p-6 space-y-2'>
    <h1 className='text-xl font-bold'>Admin Health</h1>
    <div>EventSub: {String(data?.twitch?.eventSubEnabled)}</div>
    <div>Active Sessions: {data?.twitch?.activeSessions ?? 0}</div>
    <pre className='text-xs bg-slate-100 p-3 rounded'>{JSON.stringify(data?.twitch?.channels ?? [], null, 2)}</pre>
  </div>
}
