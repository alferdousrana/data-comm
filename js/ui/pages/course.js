import { state, t } from '../../state.js';
import { allProgress, revisionItems, examScopeOf } from '../../storage/repo.js';
import { esc, $, $$ } from '../dom.js';
import { isDue } from '../../revision/scheduler.js';

const IMP = { 'very-important': ['vi', 'Very important'], important: ['im', 'Important'], supporting: ['', 'Supporting'] };
const SCOPE = { midterm: 'Midterm', final: 'Final', additional: 'Additional', unassigned: 'Unassigned' };
let filters = { q: '', scope: 'all', chapter: 'all', difficulty: 'all', importance: 'all', status: 'all' };

export default async function course(view) {
  const m = state.manifest;
  const [progress, revs] = await Promise.all([allProgress(), revisionItems()]);
  const pmap = Object.fromEntries(progress.map((p) => [p.lessonId, p]));
  const dueSet = new Set(revs.filter((r) => isDue(r)).map((r) => r.lessonId));

  view.innerHTML = `<div class="page-head"><h1>${t('কোর্স ও সিলেবাস', 'Course & syllabus')}</h1>
    <p>${m.contentStatus.complete} ${t('টি পূর্ণ লেসন', 'full lessons')} · ${m.contentStatus.outline} ${t('টি শুধু স্লাইড-আউটলাইন (পরের ব্যাচে পূর্ণ হবে)', 'slide outlines (full lessons in a later batch)')}</p></div>
    <div class="card" role="search">
      <label class="field"><span>${t('খুঁজুন: অধ্যায়, ধারণা, সংজ্ঞা, সূত্র, প্রশ্ন', 'Search chapters, concepts, formulas, questions')}</span><input type="text" name="q" value="${esc(filters.q)}" placeholder="e.g. Nyquist, B8ZS, fiber"></label>
      <div class="grid three">
        <label class="field"><span>${t('পরীক্ষা', 'Exam')}</span><select name="scope"><option value="all">All</option><option value="midterm">Midterm</option><option value="final">Final</option><option value="additional">Additional</option></select></label>
        <label class="field"><span>${t('অধ্যায়', 'Chapter')}</span><select name="chapter"><option value="all">All</option>${m.chapters.map((c) => `<option value="${c.id}">${esc(c.bookChapter)} — ${esc(c.title)}</option>`).join('')}</select></label>
        <label class="field"><span>${t('কঠিনতা', 'Difficulty')}</span><select name="difficulty"><option value="all">All</option><option>easy</option><option>medium</option><option>hard</option></select></label>
        <label class="field"><span>${t('গুরুত্ব', 'Importance')}</span><select name="importance"><option value="all">All</option><option value="very-important">Very important</option><option value="important">Important</option><option value="supporting">Supporting</option></select></label>
        <label class="field"><span>${t('অবস্থা', 'Status')}</span><select name="status"><option value="all">All</option><option value="done">Completed</option><option value="todo">Not completed</option><option value="revision">Revision required</option></select></label>
      </div>
    </div>
    <div id="chapters" style="margin-top:1rem"></div>`;
  for (const [k, v] of Object.entries(filters)) { const el = $(`[name="${k}"]`, view); if (el) el.value = v; }

  const draw = () => {
    const q = filters.q.trim().toLowerCase();
    const html = m.chapters.map((ch) => {
      const scope = examScopeOf(ch.id);
      const flag = state.syllabus.assignments[ch.id]?.flag;
      if (filters.scope !== 'all' && scope !== filters.scope) return '';
      if (filters.chapter !== 'all' && ch.id !== filters.chapter) return '';
      const ls = m.lessons.filter((l) => l.chapterId === ch.id).filter((l) => {
        if (q && !(`${l.searchText} ${ch.title}`).toLowerCase().includes(q)) return false;
        if (filters.difficulty !== 'all' && l.difficulty !== filters.difficulty) return false;
        if (filters.importance !== 'all' && l.importance.level !== filters.importance) return false;
        const done = pmap[l.id]?.completed;
        if (filters.status === 'done' && !done) return false;
        if (filters.status === 'todo' && done) return false;
        if (filters.status === 'revision' && !dueSet.has(l.id)) return false;
        return true;
      });
      if (!ls.length && !(ch.missingSource && !q && filters.status === 'all')) return '';
      const doneN = ls.filter((l) => pmap[l.id]?.completed).length;
      return `<details class="chapter" ${q || filters.chapter !== 'all' ? 'open' : ''}>
        <summary><div style="flex:1"><b>${esc(ch.bookChapter)} — ${esc(ch.title)}</b><br><span class="small muted bn">${esc(ch.titleBn)}</span></div>
          <span class="chip ${scope === 'midterm' ? 'info' : scope === 'final' ? 'im' : ''}">${SCOPE[scope]}</span><span class="small muted">${doneN}/${ls.length}</span></summary>
        ${flag ? `<div class="callout warn small" style="margin:0 1rem .75rem">⚑ ${esc(flag)}</div>` : ''}
        ${ch.missingSource ? `<p class="small muted" style="padding:0 1rem 1rem">${t('এই অধ্যায়ের স্লাইড পাওয়া যায়নি — কোনো লেসন বানানো হয়নি।', 'Slides for this chapter were not supplied, so no lessons were created.')}</p>` : ''}
        ${ls.map((l) => {
          const p = pmap[l.id] || {};
          const [cls, imp] = IMP[l.importance.level] || ['', l.importance.level];
          return `<a class="lesson-row" href="#/lesson/${l.id}"><span><b>${esc(l.title)}</b><br><span class="small muted bn">${esc(l.titleBn)}</span></span>
            <span>${p.completed ? '<span class="chip ok">✓ Done</span>' : p.readPct ? `<span class="chip">${p.readPct}% read</span>` : ''}</span>
            <span class="meta">
              ${l.status === 'outline' ? '<span class="chip">Outline only</span>' : ''}
              <span class="chip ${cls}" title="${esc(l.importance.reasons.join(' · '))}">${imp}</span>
              <span class="chip">${l.estMinutes} min</span><span class="chip">${l.difficulty}</span>
              ${l.mcqCount ? `<span class="chip">${p.quizBest != null ? `Quiz best ${p.quizBest}%` : 'Quiz not taken'}</span>` : ''}
              ${dueSet.has(l.id) ? '<span class="chip im">Revision due</span>' : ''}
              <span class="chip" title="Source">${esc(l.sourceFile)} · slides ${esc(compact(l.slides))}</span>
            </span></a>`;
        }).join('')}
      </details>`;
    }).join('');
    $('#chapters', view).innerHTML = html || `<div class="empty">${t('কোনো লেসন মেলেনি। ফিল্টার বদলাও।', 'No lessons match. Try different filters.')}</div>`;
  };
  view.addEventListener('input', (e) => { if (e.target.name in filters) { filters[e.target.name] = e.target.value; draw(); } });
  draw();
}

function compact(nums) {
  const s = [...nums].sort((a, b) => a - b); const out = [];
  for (let i = 0; i < s.length; i += 1) { let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j += 1; out.push(j > i ? `${s[i]}–${s[j]}` : `${s[i]}`); i = j; }
  return out.join(', ');
}
