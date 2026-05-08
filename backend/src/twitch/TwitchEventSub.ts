import WebSocket from 'ws';

type Handlers = {
  onWelcome: (sessionId: string) => Promise<void>;
  onNotification: (payload: any) => Promise<void>;
  onRevocation?: (payload: any) => Promise<void>;
  onReconnect?: () => Promise<void>;
  onOpen?: () => Promise<void>;
};

export class TwitchEventSub {
  private ws: WebSocket | null = null;
  private reconnectDelayMs = 1000;
  private stopped = false;
  constructor(private handlers: Handlers) {}

  connect(url = 'wss://eventsub.wss.twitch.tv/ws') {
    this.stopped = false;
    this.ws = new WebSocket(url);
    const ws = this.ws;
    ws.on('open', async () => {
      this.reconnectDelayMs = 1000;
      await this.handlers.onOpen?.();
    });
    ws.on('message', async (raw: unknown) => {
      try {
        const data = JSON.parse(String(raw));
        const t = data?.metadata?.message_type;
        if (t === 'session_welcome') await this.handlers.onWelcome(data.payload.session.id);
        else if (t === 'session_reconnect') this.reconnect(data.payload.session.reconnect_url);
        else if (t === 'session_keepalive') return;
        else if (t === 'notification') await this.handlers.onNotification(data.payload);
        else if (t === 'revocation') await this.handlers.onRevocation?.(data.payload);
      } catch {}
    });
    ws.on('close', () => {
      if (!this.stopped) this.reconnect();
    });
    ws.on('error', () => undefined);
  }

  private reconnect(url?: string) {
    if (this.stopped) return;
    void this.handlers.onReconnect?.();
    setTimeout(() => this.connect(url), this.reconnectDelayMs);
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 30000);
  }

  stop() {
    this.stopped = true;
    this.ws?.close();
    this.ws = null;
  }
}
