import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiBase, apiGet } from '../api/client';
import PageHeader from '../components/ui/PageHeader';

export default function LiveChatPage(){
  const { channelId = '' } = useParams();
  const [items,setItems]=useState<any[]>([]); const [error,setError]=useState(''); const [paused,setPaused]=useState(false); const [query,setQuery]=useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{apiGet<{items:any[]}>(`/api/channels/${channelId}/chat/messages?limit=100`).then((d)=>setItems(d.items.reverse())).catch(()=>setError('Historie konnte nicht geladen werden.'));},[channelId]);
  useEffect(()=>{let closed=false; let es:EventSource|null=null; let timer:any;
    const connect=()=>{ es = new EventSource(`${apiBase}/api/channels/${channelId}/live/chat/stream`, { withCredentials:true}); es.onmessage=(evt)=>{const e=JSON.parse(evt.data); if(e.type==='system.keepalive') return; setItems((prev)=>[...prev,e].slice(-500)); setError('');}; es.onerror=()=>{ if(closed) return; setError('Live Chat Verbindung unterbrochen'); es?.close(); timer=setTimeout(connect,3000);};};
    connect(); return ()=>{closed=true; if(timer)clearTimeout(timer); es?.close();};},[channelId]);
  useEffect(()=>{if(paused)return; boxRef.current?.scrollTo({top:boxRef.current.scrollHeight});},[items,paused]);
  const filtered=useMemo(()=>items.filter((i)=>`${i.username} ${i.message}`.toLowerCase().includes(query.toLowerCase())),[items,query]);
  return <div className='space-y-3'><PageHeader title='Live Chat' subtitle='Aktuelle Twitch-Chatnachrichten für diesen Channel.'/><div className='flex gap-2'><input className='px-3 py-2 rounded bg-zinc-900 border border-zinc-700' placeholder='Suche…' value={query} onChange={e=>setQuery(e.target.value)}/><button className='px-3 py-2 rounded bg-zinc-800' onClick={()=>setPaused((p)=>!p)}>{paused?'Auto Scroll aktivieren':'Auto Scroll pausieren'}</button></div>{error&&<div className='text-amber-400 text-sm'>{error}</div>}<div ref={boxRef} className='h-[65vh] overflow-auto rounded border border-zinc-800 bg-zinc-950 p-3 space-y-2'>{!filtered.length?<div className='text-zinc-400'>Noch keine Chatnachrichten. Schreibe etwas im Twitch Chat.</div>:filtered.map((m,i)=><div key={`${m.messageId||'hist'}-${i}`} className='text-sm'><span className='text-zinc-500 mr-2'>{new Date(m.createdAt).toLocaleTimeString()}</span><span className={m.isCommand?'text-indigo-300 font-semibold':'text-cyan-300'}>{m.username}</span><span className='mx-2 text-zinc-500'>:</span><span>{m.message}</span>{m.isCommand&&<span className='ml-2 text-xs text-indigo-400'>COMMAND</span>}</div>)}</div></div>;
}
