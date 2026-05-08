declare module 'ws' {
  export default class WebSocket {
    constructor(url: string);
    on(event: string, cb: (...args: any[]) => void): void;
    close(): void;
  }
}
