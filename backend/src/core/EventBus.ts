type EventHandler<T = unknown> = (event: T) => void;

class EventBus {
  private channels = new Map<string, Set<EventHandler>>();
  private lastPublishedAt = new Map<string, string>();
  private lastEventType = new Map<string, string | null>();

  publish<T>(channelId: string, event: T) {
    this.lastPublishedAt.set(channelId, new Date().toISOString());
    const eventType = (event as any)?.type;
    this.lastEventType.set(channelId, typeof eventType === 'string' ? eventType : null);
    const handlers = this.channels.get(channelId);
    if (!handlers) return;
    for (const handler of handlers) {
      try { handler(event); } catch {}
    }
  }

  subscribe<T>(channelId: string, handler: EventHandler<T>) {
    const handlers = this.channels.get(channelId) ?? new Set<EventHandler>();
    handlers.add(handler as EventHandler);
    this.channels.set(channelId, handlers);
  }

  unsubscribe<T>(channelId: string, handler: EventHandler<T>) {
    const handlers = this.channels.get(channelId);
    if (!handlers) return;
    handlers.delete(handler as EventHandler);
    if (handlers.size === 0) this.channels.delete(channelId);
  }

  getChannelStats(channelId: string) {
    return {
      subscribers: this.channels.get(channelId)?.size ?? 0,
      lastPublishedAt: this.lastPublishedAt.get(channelId) ?? null,
      lastEventType: this.lastEventType.get(channelId) ?? null
    };
  }
}

export const eventBus = new EventBus();
