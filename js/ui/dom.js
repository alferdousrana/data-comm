// Small DOM helpers. All dynamic text goes through esc() before insertion.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Mini markdown: **bold**, `code`, line breaks, bullet lines (• or - ), and pipe tables.
export function md(text) {
  const src = String(text ?? '');
  const lines = src.split('\n');
  if (lines.length > 2 && /^\|.*\|$/.test(lines[0].trim()) && /^\|[-|\s]+\|$/.test(lines[1].trim())) {
    const rows = lines.filter((l) => /^\|.*\|$/.test(l.trim()));
    const cells = (l) => l.trim().slice(1, -1).split('|').map((c) => inline(c.trim()));
    const head = cells(rows[0]);
    const body = rows.slice(2).map(cells);
    const rest = lines.filter((l) => !/^\|.*\|$/.test(l.trim())).join('\n');
    return `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${rest ? md(rest) : ''}`;
  }
  return lines.map((l) => (/^\s*[•-]\s+/.test(l) ? `<span style="display:block;padding-left:1em;text-indent:-.8em">• ${inline(l.replace(/^\s*[•-]\s+/, ''))}</span>` : inline(l))).join('<br>');
}
function inline(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
}

let toastHost = null;
export function toast(msg, ms = 3200) {
  if (!toastHost) { toastHost = document.createElement('div'); toastHost.className = 'toast-host'; toastHost.setAttribute('role', 'status'); toastHost.setAttribute('aria-live', 'polite'); document.body.append(toastHost); }
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
  toastHost.append(el);
  setTimeout(() => el.remove(), ms);
}

export function confirmDialog(message, okLabel = 'OK', cancelLabel = 'Cancel') {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.innerHTML = `<p>${esc(message)}</p><div class="row" style="justify-content:flex-end"><button class="btn" value="cancel">${esc(cancelLabel)}</button><button class="btn primary" value="ok">${esc(okLabel)}</button></div>`;
    document.body.append(d);
    d.addEventListener('click', (e) => { const v = e.target.closest('button')?.value; if (v) { d.close(); d.remove(); resolve(v === 'ok'); } });
    d.addEventListener('cancel', () => { d.remove(); resolve(false); });
    d.showModal();
  });
}

export const icons = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  wave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 14h4V6h4v12h4V6h4v8h4"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2"/><path d="M20 4v5h-5M4 20v-5h5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  logo: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--primary)"/><path d="M5 20h5v-9h6v11h5v-7h6" fill="none" stroke="var(--primary-ink)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/></svg>',
};

export function fmtDuration(sec) {
  const s = Math.round(sec || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
export const pct = (v) => (v == null ? '—' : `${v}%`);

// Optional feedback tone (Settings → Sound). Never essential: correctness is always shown in text.
let audioCtx = null;
export function beep(ok, enabled) {
  if (!enabled) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = ok ? 880 : 220; g.gain.value = 0.05;
    o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.15);
  } catch { /* audio unavailable */ }
}
