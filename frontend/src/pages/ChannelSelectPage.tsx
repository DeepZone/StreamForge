import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export default function ChannelSelectPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user?.channels?.length === 1) {
      navigate(`/dashboard/channels/${user.channels[0].channelId}`, { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) return <div className='p-6'>Loading...</div>;
  if (!user) return <div className='p-6'>Nicht eingeloggt.</div>;
  if (!user.channels.length) return <div className='p-6'>Kein Kanal zugeordnet. Bitte zuerst über Twitch anmelden.</div>;

  return <div className='p-6 space-y-2'>{user.channels.map((c: { channelId: string; role: string }) => <Link key={c.channelId} className='block underline' to={`/dashboard/channels/${c.channelId}`}>{c.channelId} ({c.role})</Link>)}</div>;
}
