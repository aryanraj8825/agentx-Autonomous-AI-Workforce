// Drop into agentx-frontend/src/services/socket.js
// Reconnects with backoff and calls onEvent({type, ...}) for: task.updated, log.added, message.added, notification.
import { getToken } from './api';

export function connectEvents(onEvent, onStatus = () => {}) {
  let ws, retry = 0, closed = false, timer;
  const url = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';

  const open = () => {
    const token = getToken();
    if (!token || closed) return;
    ws = new WebSocket(`${url}?token=${encodeURIComponent(token)}`);
    ws.onopen = () => { retry = 0; onStatus('connected'); };
    ws.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === 'ping') ws.send(JSON.stringify({ type: 'ping' }));
        else if (ev.type !== 'ready' && ev.type !== 'pong') onEvent(ev);
      } catch { /* ignore malformed frames */ }
    };
    ws.onclose = (e) => {
      onStatus('disconnected');
      if (closed || e.code === 4401 || e.code === 4403) return; // auth/origin problems will not fix themselves
      timer = setTimeout(open, Math.min(1000 * 2 ** retry++, 15000));
    };
  };
  open();
  return () => { closed = true; clearTimeout(timer); ws?.close(); };
}
