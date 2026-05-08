import { useState } from 'react';
import { apiBase } from '../api/client';

export default function LoginPage() {
  const [error, setError] = useState('');

  const startTwitchLogin = async () => {
    try {
      const res = await fetch(`${apiBase}/api/auth/twitch/start`, { credentials: 'include', redirect: 'manual' });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (location) window.location.href = location;
        return;
      }
      if (!res.ok) {
        setError('Twitch OAuth ist im Backend nicht korrekt konfiguriert.');
      }
    } catch {
      setError('Twitch OAuth ist aktuell nicht erreichbar.');
    }
  };

  return (
    <div className='p-6 space-y-4'>
      <h1 className='text-2xl font-semibold'>Login</h1>
      <p>Lokaler Admin-Login bleibt bestehen (separates Formular vorhanden).</p>
      <button className='rounded bg-purple-600 px-4 py-2 text-white' onClick={startTwitchLogin}>Mit Twitch anmelden</button>
      {error ? <p className='text-red-600'>{error}</p> : null}
    </div>
  );
}
