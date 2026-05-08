import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiDelete, apiGet, apiPatch, apiPost, apiBase } from '../api/client';

type Campaign = { id: string; shortCode: string; name: string; sponsorName: string; targetUrl: string; message: string; enabled: boolean; clicks?: number; _count?: { clicks?: number } };
const emptyForm = { name: '', sponsorName: '', targetUrl: '', message: '', enabled: true };

export default function CampaignsPage() {
  const { channelId = '' } = useParams();
  const [items, setItems] = useState<Campaign[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => setItems(await apiGet<Campaign[]>(`/api/channels/${channelId}/campaigns`));
  useEffect(() => { void load(); }, [channelId]);

  const save = async (evt: FormEvent) => {
    evt.preventDefault();
    if (editingId) await apiPatch(`/api/channels/${channelId}/campaigns/${editingId}`, form);
    else await apiPost(`/api/channels/${channelId}/campaigns`, form);
    setForm(emptyForm); setEditingId(null); await load();
  };

  return <div className='space-y-4'><h1 className='text-xl font-bold'>Campaigns</h1>
    <form onSubmit={save} className='grid md:grid-cols-3 gap-2 rounded border border-slate-700 p-3'>
      {Object.entries(form).map(([k, v]) => k === 'enabled' ? <label key={k}><input type='checkbox' checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Enabled</label> : <input key={k} className='bg-slate-900 border border-slate-600 px-2 py-1' placeholder={k} value={String(v)} onChange={(e) => setForm({ ...form, [k]: e.target.value })} required={k !== 'message'} />)}
      <button className='rounded bg-emerald-700 px-3 py-1'>{editingId ? 'Update' : 'Create'}</button>
    </form>
    {items.map((c) => <div key={c.id} className='rounded border border-slate-800 p-3 space-y-1'><div className='font-semibold'>{c.name} {c.enabled ? '' : '(disabled)'}</div><div>Shortcode: <code>{c.shortCode}</code> | Link: <a className='underline' href={`${apiBase}/c/${c.shortCode}`} target='_blank'>{apiBase}/c/{c.shortCode}</a></div><div>Klicks: {c.clicks ?? c._count?.clicks ?? 0}</div><div className='space-x-2'><button className='underline' onClick={() => { setEditingId(c.id); setForm({ name: c.name, sponsorName: c.sponsorName, targetUrl: c.targetUrl, message: c.message, enabled: c.enabled }); }}>Edit</button><button className='underline text-red-300' onClick={async () => { if (!window.confirm('Kampagne löschen?')) return; await apiDelete(`/api/channels/${channelId}/campaigns/${c.id}`); await load(); }}>Delete</button></div></div>)}
  </div>;
}
