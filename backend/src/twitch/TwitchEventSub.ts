import WebSocket from 'ws';

type Handlers = { onWelcome: (sessionId: string) => Promise<void>; onNotification: (payload: any) => Promise<void>; onRevocation?: (payload: any) => Promise<void> };
export class TwitchEventSub {
  private ws: WebSocket | null = null; private reconnectDelayMs = 1000; private stopped = false;
  constructor(private handlers: Handlers) {}
  connect(url = 'wss://eventsub.wss.twitch.tv/ws') { this.stopped = false; this.ws = new WebSocket(url); this.ws.on('open', () => console.log('[eventsub] connected')); this.ws.on('message', async (raw) => { try { const data = JSON.parse(raw.toString()); const t = data?.metadata?.message_type; if (t === 'session_welcome') await this.handlers.onWelcome(data.payload.session.id); else if (t === 'session_reconnect') this.reconnect(data.payload.session.reconnect_url); else if (t === 'session_keepalive') return; else if (t === 'notification') await this.handlers.onNotification(data.payload); else if (t === 'revocation') await this.handlers.onRevocation?.(data.payload); } catch (error) { console.error('[eventsub] message handling failed', error); } }); this.ws.on('close', () => { if (!this.stopped) this.reconnect(); }); this.ws.on('error', (e) => console.error('[eventsub] websocket error', e)); }
  private reconnect(url?: string) { if (this.stopped) return; setTimeout(() => this.connect(url), this.reconnectDelayMs); this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 30000); }
  stop() { this.stopped = true; this.ws?.close(); this.ws = null; }
}
