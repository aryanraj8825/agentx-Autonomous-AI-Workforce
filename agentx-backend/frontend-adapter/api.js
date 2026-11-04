// Drop into agentx-frontend/src/services/api.js
// Set VITE_USE_MOCK=false, VITE_API_URL=http://localhost:8000/api, VITE_WS_URL=ws://localhost:8000/ws
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const TOKEN_KEY = 'agentx.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function req(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  if (res.status === 401 && !path.startsWith('/auth/')) {
    setToken(null);
    window.location.assign('/login');
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
    } catch { /* not json */ }
    throw new ApiError(res.status, detail);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  login: (email, password) => req('/auth/login', { method: 'POST', body: { email, password } }),
  register: (name, email, password) => req('/auth/register', { method: 'POST', body: { name, email, password } }),
  me: () => req('/auth/me'),

  preview: (prompt, autonomy) => req('/plan/preview', { method: 'POST', body: { prompt, autonomy } }),
  listTasks: (params = {}) => req(`/tasks?${new URLSearchParams(params)}`),
  getTask: (id) => req(`/tasks/${id}`),
  createTask: (payload) => req('/tasks', { method: 'POST', body: payload }),
  cancelTask: (id) => req(`/tasks/${id}/cancel`, { method: 'POST' }),
  retryTask: (id) => req(`/tasks/${id}/retry`, { method: 'POST' }),
  approve: (id, nodeId) => req(`/tasks/${id}/approve`, { method: 'POST', body: { nodeId } }),
  reject: (id, nodeId) => req(`/tasks/${id}/reject`, { method: 'POST', body: { nodeId } }),
  deleteTasks: (ids) => req('/tasks/delete', { method: 'POST', body: { ids } }),
  upload: (file) => {
    const f = new FormData();
    f.append('file', file);
    return req('/uploads', { method: 'POST', form: f });
  },
  // Authenticated file download -> saves via a temporary object URL
  downloadFile: async (taskId, name) => {
    const res = await fetch(`${BASE}/tasks/${taskId}/files/${encodeURIComponent(name)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new ApiError(res.status, 'Download failed');
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  agents: () => req('/agents'),
  configureAgent: (id, patch) => req(`/agents/${id}/config`, { method: 'PATCH', body: patch }),
  memories: (type) => req(`/memory${type ? `?type=${type}` : ''}`),
  addMemory: (m) => req('/memory', { method: 'POST', body: m }),
  searchMemory: (q) => req('/memory/search', { method: 'POST', body: { q } }),
  pinMemory: (id) => req(`/memory/${id}/pin`, { method: 'PATCH' }),
  deleteMemory: (id) => req(`/memory/${id}`, { method: 'DELETE' }),
  integrations: () => req('/integrations'),
  connectIntegration: (id, fields) => req(`/integrations/${id}/connect`, { method: 'POST', body: { fields } }),
  disconnectIntegration: (id) => req(`/integrations/${id}`, { method: 'DELETE' }),
  analytics: (days) => req(`/analytics?days=${days}`),
  settings: () => req('/settings'),
  saveSettings: (patch) => req('/settings', { method: 'PUT', body: patch }),
  notifications: () => req('/notifications'),
  readNotifications: () => req('/notifications/read', { method: 'POST' }),
};
