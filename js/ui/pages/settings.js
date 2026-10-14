import { state, t, DEFAULT_SETTINGS } from '../../state.js';
import { saveSettings, examScopeOf, refreshPending } from '../../storage/repo.js';
import { db, STORES, storageEstimate } from '../../storage/db.js';
import { downloadForOffline, offlineStatus, CONTENT_CACHE } from '../../lessons/content.js';
import { isConfigured, signInGoogle, signInEmail, signOutUser } from '../../firebase/client.js';
import { flush, mergeRecord } from '../../sync/engine.js';
import { enqueue } from '../../storage/repo.js';
import { esc, $, $$, toast, confirmDialog } from '../dom.js';
import { render } from '../../router.js';

export const EXPORT_FORMAT = 'datacomm-academy-export';
const DATA_STORES = ['attempts', 'progress', 'bookmarks', 'notes', 'revision', 'ledger', 'activity'];

export default async function settings(view) {
  const s = state.settings;
  const m = state.manifest;
  const [est, off] = await Promise.all([storageEstimate(), offlineStatus().catch(() => ({ available: new Set(), total: 0 }))]);
  const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;

  view.innerHTML = `<div class="page-head"><h1>${t('সেটিংস', 'Settings')}</h1></div>
  <div class="stack">
  <form class="card" id="prefs"><h2>${t('প্রদর্শন ও অভ্যাস', 'Display & habits')}</h2>
    <div class="grid two">
      <label class="field"><span>${t('থিম', 'Theme')}</span><select name="theme"><option value="system">${t('সিস্টেম অনুযায়ী', 'Follow system')}</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <label class="field"><span>${t('ইন্টারফেস ভাষা', 'Interface labels')}</span><select name="uiLang"><option value="bn">বাংলা</option><option value="en">English</option></select></label>
      <label class="field"><span>${t('লেখার আকার', 'Text size')}: <output>${s.textScale}</output></span><input type="range" name="textScale" min="0.9" max="1.3" step="0.05" value="${s.textScale}"></label>
      <label class="field"><span>${t('দৈনিক লক্ষ্য (মিনিট)', 'Daily goal (minutes)')}</span><input type="number" name="dailyGoalMin" min="5" max="300" value="${s.dailyGoalMin}"></label>
      <label class="field"><span>${t('মিডটার্মের তারিখ', 'Midterm date')}</span><input type="date" name="midterm" value="${esc(s.examDates.midterm)}"></label>
      <label class="field"><span>${t('ফাইনালের তারিখ', 'Final exam date')}</span><input type="date" name="final" value="${esc(s.examDates.final)}"></label>
    </div>
    ${[['animations', t('অ্যানিমেশন', 'Animations')], ['sound', t('শব্দ (সঠিক/ভুল উত্তরে ছোট টোন)', 'Sound (short tone on right/wrong answers)')], ['gamification', t('XP ও ব্যাজ', 'XP and badges')], ['streaks', t('স্ট্রিক দেখাও', 'Show streaks')]].map(([k, l]) => `<label style="display:block;margin:.4rem 0"><input type="checkbox" name="${k}" ${s[k] ? 'checked' : ''}> ${l}</label>`).join('')}
  </form>

  <section class="card"><h2>${t('সিলেবাস', 'Syllabus')}</h2><p class="small muted">${esc(state.syllabus.note)}</p>
    <div class="table-wrap"><table><thead><tr><th>Chapter</th><th>Source</th><th>Exam</th></tr></thead><tbody>${m.chapters.map((c) => `<tr><td><b>${esc(c.bookChapter)}</b> ${esc(c.title)}${state.syllabus.assignments[c.id]?.flag ? `<br><span class="small" style="color:var(--warn)">⚑ ${esc(state.syllabus.assignments[c.id].flag)}</span>` : ''}</td><td class="small">${esc(c.file || 'missing')}</td>
      <td><select data-ch="${c.id}" aria-label="Exam for ${esc(c.title)}">${['midterm', 'final', 'additional'].map((o) => `<option value="${o}" ${examScopeOf(c.id) === o ? 'selected' : ''}>${o}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>
    <h3 style="margin-top:1rem">${t('সোর্স ফাইল যাচাই', 'Source-file check')}</h3><ul class="small">${m.sources.map((x) => `<li>${x.status === 'mismatch' ? '⚠️' : '✓'} <code>${esc(x.file)}</code> — ${esc(x.content)}${x.note ? `<br><span style="color:var(--warn)">${esc(x.note)}</span>` : ''}</li>`).join('')}</ul></section>

  <section class="card"><h2>${t('অফলাইন পড়া', 'Offline study')}</h2>
    <p>${off.available.size}/${off.total} ${t('টি লেসন এই ডিভাইসে ডাউনলোড করা আছে।', 'lessons downloaded on this device.')}</p>
    <ul class="small">${m.chapters.filter((c) => !c.missingSource).map((c) => { const ls = m.lessons.filter((l) => l.chapterId === c.id); const n = ls.filter((l) => off.available.has(l.id)).length; return `<li>${n === ls.length ? '✓' : '○'} ${esc(c.bookChapter)} — ${n}/${ls.length}</li>`; }).join('')}</ul>
    <button class="btn primary" data-dl>${t('অফলাইনের জন্য ডাউনলোড', 'Download for offline study')}</button>
    <div class="progress" style="margin-top:.6rem" hidden data-dlp><i></i></div><p class="small muted" data-dls></p>
    <p class="small muted">${t('স্টোরেজ', 'Storage')}: ${est ? `${mb(est.usage || 0)} ${t('ব্যবহৃত', 'used')} / ${mb(est.quota || 0)}` : t('ব্রাউজার জানায় না', 'not reported by this browser')}. ${t('অগ্রগতি IndexedDB তে থাকে; অ্যাপ আপডেটে মুছে যায় না।', 'Progress lives in IndexedDB and survives app updates.')}</p>
    <details class="small"><summary>${t('অ্যাপ ইনস্টল করবে কীভাবে', 'How to install the app')}</summary><p>Android Chrome: menu ⋮ → <b>Install app</b>. iPhone Safari: Share → <b>Add to Home Screen</b>. Desktop Chrome/Edge: install icon in the address bar.</p></details></section>

  <section class="card"><h2>${t('অ্যাকাউন্ট ও সিঙ্ক', 'Account & sync')}</h2>
    ${!isConfigured() ? `<div class="callout info small">${t('Firebase কনফিগার করা হয়নি — অ্যাপটি এই ডিভাইসে লোকালভাবে পুরোপুরি কাজ করছে। ক্লাউড সিঙ্কের জন্য README দেখো (js/firebase/config.js)।', 'Firebase is not configured — the app works fully on this device. For cloud sync, see the README (js/firebase/config.js).')}</div>`
      : state.user ? `<p>${t('সাইন ইন', 'Signed in as')} <b>${esc(state.user.displayName || state.user.email)}</b></p><p class="small">${t('সিঙ্ক অবস্থা', 'Sync status')}: ${esc(state.syncStatus)} · ${state.pendingSync} ${t('বাকি', 'pending')} ${state.syncError ? `· ${esc(state.syncError)}` : ''}</p><div class="row"><button class="btn" data-sync>${t('এখন সিঙ্ক করো', 'Sync now')}</button><button class="btn" data-out>${t('সাইন আউট', 'Sign out')}</button></div>`
      : `<p class="small muted">${t('গেস্ট ডেটা শুধু এই ডিভাইসে থাকে যতক্ষণ না সাইন ইন বা এক্সপোর্ট করো।', 'Guest data stays on this device until you sign in or export it.')}</p>
        <button class="btn primary" data-google>${t('Google দিয়ে সাইন ইন', 'Sign in with Google')}</button>
        <form id="em" class="grid two" style="margin-top:1rem"><label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label><label class="field"><span>Password</span><input type="password" name="pw" autocomplete="current-password" minlength="6" required></label>
        <div class="row"><button class="btn" name="mode" value="in">${t('সাইন ইন', 'Sign in')}</button><button class="btn" name="mode" value="up">${t('অ্যাকাউন্ট তৈরি', 'Create account')}</button></div></form>`}
    <label class="field" style="margin-top:1rem"><span>${t('ঐচ্ছিক AI মূল্যায়ন এন্ডপয়েন্ট (তোমার নিজের নিরাপদ সার্ভার; কোনো API key নয়)', 'Optional AI evaluation endpoint (your own secure server URL — never an API key)')}</span><input type="text" name="aiEndpoint" value="${esc(s.aiEndpoint)}" placeholder="https://…cloudfunctions.net/evaluate"></label>
    <p class="small muted">${t('সাইন ইন ও এন্ডপয়েন্ট না থাকলে শুধু লোকাল রুব্রিক মূল্যায়ন চলে।', 'Without sign-in and an endpoint, only local rubric evaluation runs.')}</p></section>

  <section class="card"><h2>${t('ডেটা', 'Your data')}</h2>
    <p class="small muted">${t('এক্সপোর্ট ফাইলটি ব্যাকআপ বা অন্য ডিভাইসে নেওয়ার জন্য। সাইন ইন করা থাকলে ক্লাউড সিঙ্ক স্বয়ংক্রিয়ভাবে এটা করে।', 'Use export to back up or move to another device. When signed in, cloud sync does this automatically.')}</p>
    <div class="row"><button class="btn" data-export>${t('অগ্রগতি এক্সপোর্ট (JSON)', 'Export progress (JSON)')}</button>
      <label class="btn">${t('ইমপোর্ট', 'Import')}<input type="file" accept="application/json,.json" data-import hidden></label>
      <button class="btn danger" data-wipe>${t('এই ডিভাইসের সব ডেটা মুছো', 'Delete all data on this device')}</button></div>
    <p class="small" data-imsg role="status"></p></section>
  </div>`;

  // Preferences
  const prefs = $('#prefs', view);
  prefs.theme.value = s.theme; prefs.uiLang.value = s.uiLang;
  prefs.addEventListener('input', async (e) => {
    const f = prefs;
    if (e.target.name === 'textScale') $('output', f).textContent = e.target.value;
    await saveSettings({ theme: f.theme.value, uiLang: f.uiLang.value, textScale: Number(f.textScale.value), dailyGoalMin: Math.max(5, Math.min(300, Number(f.dailyGoalMin.value) || 30)),
      examDates: { midterm: f.midterm.value, final: f.final.value }, animations: f.animations.checked, sound: f.sound.checked, gamification: f.gamification.checked, streaks: f.streaks.checked });
    if (e.target.name === 'uiLang') render();
  });
  $$('[data-ch]', view).forEach((sel) => sel.addEventListener('change', async () => { await saveSettings({ syllabusOverrides: { ...state.settings.syllabusOverrides, [sel.dataset.ch]: sel.value } }); toast(t('সিলেবাস আপডেট হয়েছে', 'Syllabus updated')); }));
  $('[name="aiEndpoint"]', view).addEventListener('change', async (e) => {
    const v = e.target.value.trim();
    if (v && !/^https:\/\//.test(v)) { toast(t('এন্ডপয়েন্ট অবশ্যই https:// দিয়ে শুরু হবে', 'Endpoint must start with https://')); return; }
    await saveSettings({ aiEndpoint: v });
  });

  // Offline download
  $('[data-dl]', view).onclick = async (e) => {
    e.target.disabled = true;
    const bar = $('[data-dlp]', view); bar.hidden = false;
    try {
      const r = await downloadForOffline((d, n) => { bar.firstElementChild.style.width = `${Math.round((d / n) * 100)}%`; $('[data-dls]', view).textContent = `${d}/${n}`; });
      toast(r.failed.length ? `${r.failed.length} file(s) failed — try again online` : t('সব লেসন অফলাইনে প্রস্তুত', 'All lessons ready offline'));
      render();
    } catch (err) { toast(err.message); e.target.disabled = false; }
  };

  // Auth
  const authErr = (err) => toast(`${t('সাইন ইন ব্যর্থ', 'Sign-in failed')}: ${err?.code || err?.message || err}`, 6000);
  $('[data-google]', view)?.addEventListener('click', () => signInGoogle().catch(authErr));
  $('#em', view)?.addEventListener('submit', (e) => { e.preventDefault(); const f = new FormData(e.target); signInEmail(f.get('email'), f.get('pw'), e.submitter?.value === 'up').catch(authErr); });
  $('[data-out]', view)?.addEventListener('click', async () => { await signOutUser(); location.reload(); });
  $('[data-sync]', view)?.addEventListener('click', async () => { await flush(); render(); });

  // Export / import / wipe
  $('[data-export]', view).onclick = async () => {
    const data = { format: EXPORT_FORMAT, version: 1, exportedAt: new Date().toISOString(), app: 'DataComm Academy', settings: state.settings, stores: {} };
    for (const st of DATA_STORES) data.stores[st] = await db.all(st);
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `datacomm-progress-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('[data-import]', view).onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const msg = $('[data-imsg]', view);
    try {
      if (file.size > 25 * 1048576) throw new Error('File is larger than 25 MB');
      const res = await importData(JSON.parse(await file.text()));
      msg.textContent = `${t('ইমপোর্ট সম্পন্ন', 'Import complete')}: ${res.added} added/merged, ${res.skipped} skipped.`;
      await refreshPending();
    } catch (err) { msg.textContent = `${t('ইমপোর্ট ব্যর্থ', 'Import failed')}: ${err.message}`; }
    e.target.value = '';
  };
  $('[data-wipe]', view).onclick = async () => {
    if (!(await confirmDialog(t('এই ডিভাইসের সব অগ্রগতি, উত্তর, নোট ও ডাউনলোড মুছে যাবে। (ক্লাউডের ডেটা মুছবে না।) আগে এক্সপোর্ট করে রাখো।', 'This deletes all progress, answers, notes and downloads on this device (cloud data is not deleted). Export first if you need a backup.'), t('সব মুছো', 'Delete everything'), t('বাতিল', 'Cancel')))) return;
    for (const st of Object.keys(STORES)) await db.clear(st);
    try { localStorage.removeItem('dca.theme'); localStorage.removeItem('dca.textScale'); await caches.delete(CONTENT_CACHE); } catch { /* ignore */ }
    await saveSettings({ ...DEFAULT_SETTINGS });
    await db.clear('syncQueue');
    location.hash = '/welcome'; location.reload();
  };
}

// Validates an export file and merges it. Records are written locally and queued for sync
// under the signed-in user's own path, so imports can never write to someone else's data.
export async function importData(data) {
  if (!data || data.format !== EXPORT_FORMAT) throw new Error('Not a DataComm Academy export file');
  if (data.version !== 1) throw new Error(`Unsupported export version ${data.version}`);
  if (typeof data.stores !== 'object') throw new Error('Missing data');
  let added = 0, skipped = 0;
  for (const st of DATA_STORES) {
    const rows = data.stores[st];
    if (rows == null) continue;
    if (!Array.isArray(rows)) throw new Error(`${st} must be a list`);
    const key = STORES[st].keyPath;
    for (const r of rows) {
      if (!r || typeof r !== 'object' || typeof r[key] !== 'string' || r[key].length > 300 || JSON.stringify(r).length > 300000) { skipped += 1; continue; }
      const local = await db.get(st, r[key]);
      const merged = local ? mergeRecord(st, local, r) : r;
      if (merged) { await db.put(st, merged); await enqueue(st, merged); added += 1; } else skipped += 1;
    }
  }
  return { added, skipped };
}
