import WebSocket from 'ws';

type Handlers = {
  onWelcome: (sessionId: string) => Promise<void>;
  onNotification: (payload: any) => Promise<void>;
  onRevocation?: (payload: any) => Promise<void>;
  onReconnect?: () => Promise<void>;
  onOpen?: () => Promise<void>;
  onClose?: () => Promise<void>;
};

export class TwitchEventSub {
  private ws: WebSocket | null = null;
  private reconnectDelayMs = 1000;
  private stopped = false;
  private connected = false;
  private currentSessionId: string | null = null;
  public lastError: string | null = null;
  public lastConnectedAt: string | null = null;
  public lastWelcomeAt: string | null = null;
  public lastReconnectAt: string | null = null;

  constructor(private handlers: Handlers) {}

  connect(url = 'wss://eventsub.wss.twitch.tv/ws') {
    this.stopped = false;
    this.ws = new WebSocket(url);
    const ws = this.ws;

    ws.on('open', async () => {
      this.connected = true;
      this.lastError = null;
      this.lastConnectedAt = new Date().toISOString();
      this.reconnectDelayMs = 1000;
      await this.handlers.onOpen?.();
    });

    ws.on('message', async (raw: unknown) => {
      try {
        const data = JSON.parse(String(raw));
        const t = data?.metadata?.message_type;
        if (t === 'session_welcome') {
          this.currentSessionId = data?.payload?.session?.id ?? null;
          this.lastWelcomeAt = new Date().toISOString();
          if (this.currentSessionId) await this.handlers.onWelcome(this.currentSessionId);
        } else if (t === 'session_reconnect') {
          this.reconnect(data?.payload?.session?.reconnect_url);
        } else if (t === 'session_keepalive') return;
        else if (t === 'notification') await this.handlers.onNotification(data.payload);
        else if (t === 'revocation') await this.handlers.onRevocation?.(data.payload);
      } catch (e: any) {
        this.lastError = e?.message ?? 'message_parse_failed';
      }
    });

    ws.on('close', async () => {
      this.connected = false;
      this.currentSessionId = null;
      await this.handlers.onClose?.();
      if (!this.stopped) this.reconnect();
    });

    ws.on('error', (e: any) => {
      this.lastError = e?.message ?? 'eventsub_socket_error';
    });
  }

  private reconnect(url?: string) {
    if (this.stopped) return;
    this.connected = false;
    this.currentSessionId = null;
    this.lastReconnectAt = new Date().toISOString();
    void this.handlers.onReconnect?.();
    setTimeout(() => this.connect(url), this.reconnectDelayMs);
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 30000);
  }

  getSessionId() { return this.currentSessionId; }
  isConnected() { return this.connected; }

  stop() {
    this.stopped = true;
    this.connected = false;
    this.currentSessionId = null;
    this.ws?.close();
    this.ws = null;
  }
}
