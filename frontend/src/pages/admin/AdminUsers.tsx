import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../api/client';
import PageHeader from '../../components/ui/PageHeader';
import LoadingState from '../../components/ui/LoadingState';
import EmptyState from '../../components/ui/EmptyState';
import ErrorBox from '../../components/ui/ErrorBox';
import Badge from '../../components/ui/Badge';

type AdminUser = { id: string; email?: string; displayName: string; role: string; createdAt: string; updatedAt: string; channelRolesCount: number; lastLoginAt: string | null };

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { apiGet<AdminUser[]>('/api/admin/users').then(setUsers).catch(() => setError('Benutzer konnten nicht geladen werden.')).finally(() => setLoading(false)); }, []);
  const filtered = useMemo(() => users.filter((u) => `${u.displayName} ${u.email || ''}`.toLowerCase().includes(q.toLowerCase())), [users, q]);
  return <div className='p-6 space-y-4'><PageHeader title='Benutzerverwaltung' subtitle='Systemnutzer und Rollen verwalten.' /><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder='Suche nach Name oder E-Mail' className='w-full max-w-md rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm' />{loading ? <LoadingState label='Lade Benutzer…' /> : error ? <ErrorBox message={error} /> : filtered.length===0 ? <EmptyState title='Keine Benutzer' description='Es wurden keine Benutzer gefunden.' /> : <div className='space-y-2'>{filtered.map((u)=><div key={u.id} className='rounded border border-zinc-800 bg-zinc-900 p-3 flex items-center justify-between gap-3'><div><div className='font-medium'>{u.displayName}</div><div className='text-xs text-zinc-400'>{u.email || '—'} · Erstellt: {new Date(u.createdAt).toLocaleDateString('de-DE')}</div></div><Badge>{u.role}</Badge></div>)}</div>}</div>;
}
