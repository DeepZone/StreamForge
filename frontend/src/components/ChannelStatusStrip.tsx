import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../api/client';

type Status = {channelId:string;generatedAt:string;live:{isLive:boolean;viewerCount:number;title:string|null;gameName:string|null;startedAt:string|null;durationSeconds:number};subscribers:{available:boolean;count:number|null;missingScopes:string[]};streamHealth:{bitrateKbps:number|null;available:boolean};eventSub:{enabled:boolean;connected:boolean;subscribed:boolean};platformBot:{canSend:boolean;moderatorStatus:string}};

const fmt=(s:number)=>new Date(s*1000).toISOString().substring(11,19);

export default function ChannelStatusStrip({channelId}:{channelId:string}){
  const [data,setData]=useState<Status|null>(null); const [err,setErr]=useState<string | null>(null);
  const load=async()=>{try{setErr(null); setData(await apiGet<Status>(`/api/channels/${channelId}/twitch/status`));}catch{setErr('Status aktuell nicht verfügbar.')}};
  useEffect(()=>{void load(); const id=setInterval(()=>void load(),30000); return ()=>clearInterval(id);},[channelId]);
  const subLabel=useMemo(()=>{if(!data) return 'Subs: -'; if(data.subscribers.available && data.subscribers.count!==null) return `Subs ${data.subscribers.count}`; return 'Subs nicht verfügbar';},[data]);
  return <div className='rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 flex flex-wrap items-center gap-3'>
    <span className={`font-semibold ${data?.live.isLive?'text-emerald-400':'text-zinc-400'}`}>{data?.live.isLive?'LIVE':'OFFLINE'}</span>
    <span>👁 {data?.live.viewerCount ?? 0}</span>
    <span title={data?.subscribers.missingScopes?.length?'Scope channel:read:subscriptions fehlt. Twitch erneut verbinden.':''}>⭐ {subLabel}</span>
    <span className='max-w-[240px] truncate'>{data?.live.title ?? '-'}</span>
    <span>{data?.live.gameName ?? '-'}</span>
    <span>{data?.live.isLive ? `Läuft ${fmt(data.live.durationSeconds)}` : '-'}</span>
    <span>{data?.eventSub.enabled ? (data?.eventSub.connected && data?.eventSub.subscribed ? 'EventSub OK' : 'EventSub getrennt') : 'EventSub aus'}</span>
    <span>Bitrate: {data?.streamHealth.available && data?.streamHealth.bitrateKbps !== null ? `${data.streamHealth.bitrateKbps} kbps` : 'n/a'}</span>
    <button onClick={()=>void load()} className='ml-auto rounded bg-zinc-800 px-2 py-1 hover:bg-zinc-700'>Aktualisieren</button>
    {err && <span className='text-amber-400'>{err}</span>}
  </div>;
}
