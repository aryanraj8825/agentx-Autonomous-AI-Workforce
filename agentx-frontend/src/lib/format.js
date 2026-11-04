export const fmtNumber = (n) => new Intl.NumberFormat('en-US').format(Math.round(n));

export const fmtCompact = (n) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export const fmtUsd = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: n < 1 ? 3 : 2,
    maximumFractionDigits: n < 1 ? 3 : 2,
  }).format(n);

export const fmtPct = (n, digits = 0) => `${(n * 100).toFixed(digits)}%`;

export function fmtDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return '–';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs.toString().padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function timeAgo(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

export const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export const fmtDateTime = (ts) =>
  new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const fmtClock = (ts) =>
  new Date(ts).toLocaleTimeString('en-GB', { hour12: false });

export const fmtBytes = (b) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

export function download(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
