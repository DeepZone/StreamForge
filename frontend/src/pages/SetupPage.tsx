import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

type SetupStatus = { setupAllowed: boolean };

export default function SetupPage() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const setupStatus = await apiGet<SetupStatus>('/api/setup/status');
        setStatus(setupStatus);
      } catch {
        setError('Setup-Status konnte nicht geladen werden. Bitte Backend und API-URL prüfen.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwort und Passwort-Bestätigung stimmen nicht überein.');
      return;
    }
    setSubmitting(true);
    try {
      await apiPost<{ ok: true }>('/api/setup/create-owner', { displayName, email, password });
      await refresh();
      navigate('/channels', { replace: true });
    } catch (err: any) {
      setError(err?.data?.error || 'Owner konnte nicht erstellt werden.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className='p-6'>Setup wird geladen…</div>;

  if (!status?.setupAllowed) {
    return (
      <div className='p-6 space-y-3'>
        <h1 className='text-2xl font-semibold'>Setup</h1>
        <p>Setup wurde bereits abgeschlossen.</p>
        <Link className='text-emerald-400 underline' to='/login'>Zum Login</Link>
      </div>
    );
  }

  return (
    <div className='p-6 max-w-md space-y-4'>
      <h1 className='text-2xl font-semibold'>Ersten Admin anlegen</h1>
      <form className='space-y-3 rounded border border-slate-700 bg-slate-900 p-4' onSubmit={submit}>
        <input className='w-full rounded border border-slate-600 bg-slate-950 px-3 py-2' placeholder='Anzeigename' value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        <input type='email' className='w-full rounded border border-slate-600 bg-slate-950 px-3 py-2' placeholder='E-Mail' value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type='password' className='w-full rounded border border-slate-600 bg-slate-950 px-3 py-2' placeholder='Passwort' value={password} onChange={(e) => setPassword(e.target.value)} required />
        <input type='password' className='w-full rounded border border-slate-600 bg-slate-950 px-3 py-2' placeholder='Passwort bestätigen' value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
        <button className='rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-70' disabled={submitting} type='submit'>{submitting ? 'Speichern…' : 'Admin erstellen'}</button>
      </form>
      {error ? <p className='rounded border border-red-700 bg-red-950 p-3 text-red-300'>{error}</p> : null}
    </div>
  );
}
