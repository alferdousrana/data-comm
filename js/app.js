import { state, setState, subscribe, t } from './state.js';
import { openDb, requestPersistence } from './storage/db.js';
import { loadSettings, addStudyTime, refreshPending, saveSettings } from './storage/repo.js';
import { loadManifest } from './lessons/content.js';
import { route, startRouter, setNotFound, currentPath, render } from './router.js';
import { $, esc, icons, toast } from './ui/dom.js';
import { initFirebase, onAuth, isConfigured } from './firebase/client.js';
import { startSyncLoop, onSignedIn, flush } from './sync/engine.js';

const NAV = [
  { path: '/', label: () => t('হোম', 'Home'), icon: 'home', match: (p) => p === '/' || p === '/dashboard' },
  { path: '/course', label: () => t('কোর্স', 'Course'), icon: 'book', match: (p) => p.startsWith('/course') || p.startsWith('/lesson') },
  { path: '/practice', label: () => t('অনুশীলন', 'Practice'), icon: 'pen', match: (p) => p.startsWith('/practice') || p.startsWith('/exam') || p.startsWith('/sim') || p.startsWith('/results') },
  { path: '/revision', label: () => t('রিভিশন', 'Revision'), icon: 'repeat', match: (p) => p.startsWith('/revision') },
  { path: '/achievements', label: () => t('অর্জন', 'Achievements'), icon: 'star', match: (p) => p.startsWith('/achievements'), desktopOnly: true },
  { path: '/settings', label: () => t('সেটিংস', 'Settings'), icon: 'gear', match: (p) => p.startsWith('/settings') },
];

export function applyTheme() {
  const s = state.settings;
  const root = document.documentElement;
  if (s.theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', s.theme);
  root.style.setProperty('--scale', String(s.textScale || 1));
  root.classList.toggle('no-motion', !s.animations);
  root.lang = s.uiLang === 'en' ? 'en' : 'bn';
}

function renderShell() {
  const p = currentPath();
  const link = (n) => `<a href="#${n.path}" ${n.match(p) ? 'aria-current="page"' : ''}>${icons[n.icon]}<span>${esc(n.label())}</span></a>`;
  $('#sidenav').innerHTML = NAV.map(link).join('') + `<div class="group">${t('টুলস', 'Tools')}</div>
    <a href="#/sim/linecoding" ${p.startsWith('/sim') ? 'aria-current="page"' : ''}>${icons.wave}<span>${t('সিমুলেটর', 'Simulators')}</span></a>
    <a href="#/exam" ${p.startsWith('/exam') ? 'aria-current="page"' : ''}>${icons.clock}<span>${t('মক পরীক্ষা', 'Mock exam')}</span></a>`;
  $('#bottomnav').innerHTML = NAV.filter((n) => !n.desktopOnly).map(link).join('');
  renderStatus();
}

function renderStatus() {
  const el = $('#status');
  if (!el) return;
  let stateName = 'online', text = t('লোকাল', 'Local');
  if (!state.online) { stateName = 'offline'; text = t('অফলাইন', 'Offline'); }
  else if (state.syncStatus === 'syncing') text = t('সিঙ্ক হচ্ছে…', 'Syncing…');
  else if (state.syncStatus === 'error') { stateName = 'error'; text = t('সিঙ্ক পুনরায় চেষ্টা হবে', 'Sync will retry'); }
  else if (state.user) text = t('সিঙ্কড', 'Synced');
  const pending = state.pendingSync && state.user ? ` · ${state.pendingSync} ${t('বাকি', 'pending')}` : '';
  el.dataset.state = stateName;
  el.innerHTML = `<span class="dot"></span>${esc(text + pending)}`;
  el.title = state.syncError || '';
}

function registerRoutes() {
  const page = (name, fn = 'default') => async (params) => {
    const view = $('#view');
    try {
      const mod = await import(`./ui/pages/${name}.js`);
      await mod[fn](view, params);
    } catch (e) {
      console.error(e);
      view.innerHTML = `<div class="callout bad"><b>${t('পেজটি লোড হয়নি', 'This page could not load')}.</b> ${esc(e.message)}<br><a href="#/">${t('হোমে ফিরে যাও', 'Back to home')}</a></div>`;
    }
    renderShell();
    view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  };
  route('/', page('dashboard'));
  route('/dashboard', page('dashboard'));
  route('/welcome', page('welcome'));
  route('/course', page('course'));
  route('/lesson/:id', page('lesson'));
  route('/practice', page('practice'));
  route('/practice/numeric/:topic', page('practice', 'numeric'));
  route('/quiz/:lessonId', page('mcq'));
  route('/quiz/:lessonId/:mode', page('mcq'));
  route('/written/:qid', page('written'));
  route('/practice/written', page('written', 'list'));
  route('/sim/:id', page('practice', 'sims'));
  route('/exam', page('exam', 'list'));
  route('/exam/:id', page('exam'));
  route('/results', page('results'));
  route('/results/:id', page('results', 'detail'));
  route('/revision', page('revision'));
  route('/achievements', page('achievements'));
  route('/settings', page('settings'));
  setNotFound(() => { $('#view').innerHTML = `<div class="empty"><h2>${t('পেজ পাওয়া যায়নি', 'Page not found')}</h2><a class="btn" href="#/">${t('হোম', 'Home')}</a></div>`; renderShell(); });
}

// Study time: counted only while the tab is visible and the student has interacted recently.
function startStudyTimer() {
  let last = Date.now(), lastInput = Date.now();
  ['pointerdown', 'keydown', 'scroll'].forEach((ev) => window.addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true }));
  setInterval(() => {
    const now = Date.now();
    if (document.visibilityState === 'visible' && now - lastInput < 120000) addStudyTime((now - last) / 1000).catch(() => {});
    last = now;
  }, 30000);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./service-worker.js', { scope: './' }).then((reg) => {
    const showUpdate = (w) => {
      const bar = document.createElement('div');
      bar.className = 'callout info';
      bar.style.cssText = 'position:fixed;left:12px;right:12px;top:70px;z-index:70;max-width:520px;margin:auto';
      bar.innerHTML = `${t('নতুন সংস্করণ এসেছে। তোমার সব অগ্রগতি সংরক্ষিত থাকবে।', 'A new version is available. Your progress is kept.')} <button class="btn small primary">${t('আপডেট করো', 'Update')}</button>`;
      bar.querySelector('button').onclick = () => w.postMessage({ type: 'skip-waiting' });
      document.body.append(bar);
    };
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w); });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  }).catch((e) => console.warn('Service worker registration failed', e));
}

async function main() {
  registerRoutes();
  try { await openDb(); } catch (e) {
    $('#view').innerHTML = `<div class="callout bad"><b>Storage unavailable.</b> ${esc(e.message)}. Progress cannot be saved in this browser mode (private windows may block it).</div>`;
  }
  await loadSettings().catch(() => {});
  applyTheme();
  subscribe(() => { applyTheme(); renderStatus(); });
  try { await loadManifest(); } catch (e) {
    $('#view').innerHTML = `<div class="callout bad"><b>${t('কোর্স ডেটা লোড হয়নি', 'Course data could not load')}.</b> ${esc(e.message)}. ${t('একবার অনলাইনে খুলে “অফলাইনের জন্য ডাউনলোড” করো।', 'Open the app online once and use “Download for offline study”.')}</div>`;
    renderShell();
    return;
  }
  renderShell();
  if (!state.settings.onboarded && !location.hash) location.hash = '/welcome';
  await startRouter();
  startStudyTimer();
  registerServiceWorker();
  requestPersistence();
  await refreshPending().catch(() => {});

  if (isConfigured()) {
    initFirebase().then(() => onAuth(async (user) => {
      setState({ user });
      if (user) {
        const res = await onSignedIn(user);
        if (res?.needsConsent) {
          const { confirmDialog } = await import('./ui/dom.js');
          const ok = await confirmDialog(t('এই ডিভাইসে গেস্ট হিসেবে যে অগ্রগতি আছে তা তোমার অ্যাকাউন্টে আপলোড করবে? লোকাল ডেটা মুছবে না।', 'Upload the progress saved on this device as a guest to your account? Local data will not be deleted.'), t('আপলোড', 'Upload'), t('এখন না', 'Not now'));
          await onSignedIn(user, { uploadGuestData: ok });
        } else if (res?.conflictAccount) {
          toast(t('এই ডিভাইসের ডেটা অন্য অ্যাকাউন্টের। এক্সপোর্ট করে নিয়ে তারপর ইমপোর্ট করো।', 'This device’s data belongs to another account. Use export/import to move it.'), 7000);
        }
        render();
      }
    })).catch(() => {});
  }
  startSyncLoop();
}

window.addEventListener('error', (e) => console.error('Uncaught', e.error));
main();
export { saveSettings, flush };
