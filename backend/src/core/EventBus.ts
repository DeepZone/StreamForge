type EventHandler<T = unknown> = (event: T) => void;

class EventBus {
  private channels = new Map<string, Set<EventHandler>>();

  publish<T>(channelId: string, event: T) {
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
}

export const eventBus = new EventBus();
