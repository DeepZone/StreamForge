import { FormEvent, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useNavigate } from 'react-router-dom';
import { apiBase, apiPost } from '../api/client';

export default function LoginPage() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loginLocal = async (evt: FormEvent) => {
    evt.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiPost<{ ok: true }>('/api/auth/login', { email, password });
      const me = await refresh();
      if (!me) {
        setError(`Login erfolgreich, aber keine Session aktiv. Prüfe Cookie-/HTTPS-Setup und API-Basis (${apiBase || 'same-origin /api'}).`);
        return;
      }
      navigate('/channels', { replace: true });
    } catch (err: any) {
      if (err?.status === 401) {
        setError('E-Mail oder Passwort ist falsch.');
      } else if (err?.status === 400) {
        setError(err?.data?.error ?? 'Bitte alle Pflichtfelder korrekt ausfüllen.');
      } else {
        setError(`Login ist aktuell nicht erreichbar. API-Basis: ${apiBase || 'same-origin /api'}. Bitte Backend-Status und VITE_API_URL prüfen.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const startTwitchLogin = async () => {
    try {
      const res = await fetch(`${apiBase}/api/auth/twitch/start`, { credentials: 'include', redirect: 'manual' });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (location) window.location.href = location;
        return;
      }
      if (!res.ok) setError('Twitch OAuth ist im Backend nicht korrekt konfiguriert.');
    } catch {
      setError('Twitch OAuth ist aktuell nicht erreichbar.');
    }
  };

  return (
    <div className='p-6 space-y-6 max-w-md'>
      <h1 className='text-2xl font-semibold'>Login</h1>
      <form className='space-y-3 rounded border border-slate-700 bg-slate-900 p-4' onSubmit={loginLocal}>
        <h2 className='text-lg font-medium'>Lokaler Admin-Login</h2>
        <label className='block space-y-1'>
          <span className='text-sm text-slate-300'>E-Mail</span>
          <input type='email' className='w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100' value={email} onChange={(e) => setEmail(e.target.value)} autoComplete='username' required />
        </label>
        <label className='block space-y-1'>
          <span className='text-sm text-slate-300'>Passwort</span>
          <input type='password' className='w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100' value={password} onChange={(e) => setPassword(e.target.value)} autoComplete='current-password' required />
        </label>
        <button type='submit' disabled={loading} className='rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-70'>
          {loading ? 'Einloggen…' : 'Einloggen'}
        </button>
      </form>
      <div className='space-y-2'>
        <p>Alternativ:</p>
        <button className='rounded bg-purple-600 px-4 py-2 text-white' onClick={startTwitchLogin}>Mit Twitch anmelden</button>
      </div>
      {error ? <p className='rounded border border-red-700 bg-red-950 p-3 text-red-300'>{error}</p> : null}
    </div>
  );
}
