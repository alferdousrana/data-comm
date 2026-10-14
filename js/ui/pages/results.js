import { state, t } from '../../state.js';
import { allAttempts, getAttempt } from '../../storage/repo.js';
import { loadBank, findWritten } from '../../lessons/content.js';
import { feedbackHtml } from '../feedback.js';
import { esc, $ } from '../dom.js';

const KIND = { 'mcq-quiz': 'MCQ quiz', written: 'Written', numeric: 'Numerical', exam: 'Mock exam' };
const summary = (a) => a.kind === 'mcq-quiz' ? `${a.correct}/${a.total}` : a.kind === 'numeric' ? (a.allCorrect ? '✓ correct' : '✗') : a.kind === 'written' ? `${a.result.score}/${a.result.total}` : `${a.score}/${a.total}`;

export default async function results(view) {
  const all = await allAttempts();
  view.innerHTML = `<div class="page-head"><h1>${t('ফলাফলের ইতিহাস', 'Results history')}</h1><p>${all.length} ${t('টি সংরক্ষিত চেষ্টা', 'saved attempts')}</p></div>
    <label class="field" style="max-width:280px"><span>${t('ধরন', 'Type')}</span><select id="k"><option value="">All</option>${Object.entries(KIND).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label><div id="rl"></div>`;
  const draw = () => {
    const k = $('#k', view).value;
    const rows = all.filter((a) => !k || a.kind === k);
    $('#rl', view).innerHTML = rows.length ? `<div class="card"><ul class="list">${rows.map((a) => `<li class="row between"><span><a href="#/results/${a.id}">${esc(a.title || a.kind)}</a><br><span class="small muted">${KIND[a.kind] || a.kind} · ${new Date(a.createdAt).toLocaleString()}</span></span><b>${summary(a)}</b></li>`).join('')}</ul></div>` : `<div class="empty">${t('কিছু নেই', 'Nothing here yet')}</div>`;
  };
  $('#k', view).onchange = draw;
  draw();
}

export async function detail(view, { id }) {
  const a = await getAttempt(id);
  if (!a) { view.innerHTML = `<div class="empty">${t('পাওয়া যায়নি', 'Attempt not found')}</div>`; return; }
  let body = '';
  if (a.kind === 'written') {
    const q = await findWritten(a.questionId);
    body = `<div class="card"><p style="white-space:pre-wrap"><b>${esc(q?.question || '')}</b></p><h4>${t('তোমার উত্তর', 'Your answer')}</h4><div class="exam-answer">${esc(a.answer.text || '')}${a.answer.levels ? `\nLevels: ${esc(a.answer.levels)}` : ''}${Object.entries(a.answer.levelsBy || {}).map(([k, v]) => `\n${esc(k)}: ${esc(v)}`).join('')}${a.answer.spikes ? `\nSpikes: ${esc(a.answer.spikes)}` : ''}</div>${a.drawing ? `<img src="${a.drawing}" alt="Your drawing" style="border:1px solid var(--line);border-radius:8px;background:#fff">` : ''}</div>
      ${q ? feedbackHtml(q, a.result, { ai: a.ai }) : ''}<p><a class="btn primary" href="#/written/${a.questionId}">${t('আবার চেষ্টা করো', 'Retry')}</a></p>`;
  } else if (a.kind === 'mcq-quiz') {
    const banks = {};
    for (const it of a.items) banks[it.lessonId] ||= await loadBank(it.lessonId).catch(() => null);
    body = `<div class="card"><p class="score-big">${a.correct}/${a.total} (${a.percent}%)</p><ol>${a.items.map((it) => { const q = banks[it.lessonId]?.mcqs.find((m) => m.id === it.qid); return q ? `<li style="margin-bottom:.8rem"><b>${esc(q.q)}</b><br>${it.correct ? '<span class="verdict ok">✓</span>' : `<span class="verdict bad">✗</span> ${t('তোমার', 'yours')}: ${it.chosen == null ? '—' : esc(q.options[it.chosen])}`}<br>${t('সঠিক', 'correct')}: ${esc(q.options[q.answer])}<br><span class="bn small">${esc(q.explainBn)}</span></li>` : ''; }).join('')}</ol>
      <a class="btn primary" href="#/quiz/${a.lessonId}">${t('আবার দাও', 'Retake')}</a></div>`;
  } else if (a.kind === 'numeric') {
    body = `<div class="card"><p>${esc(a.title)}</p><p>${t('তোমার উত্তর', 'Your inputs')}: ${a.inputs.map(esc).join(' | ')}</p><p>${a.allCorrect ? '✓' : '✗'}</p><a class="btn primary" href="#/practice/numeric/${a.topic}">${t('আরো অনুশীলন', 'Practise more')}</a></div>`;
  } else if (a.kind === 'exam') {
    body = `<div class="card"><p class="score-big">${a.score}/${a.total} (${a.percent}%)</p><p class="small muted">${Math.round(a.durationSec / 60)} min</p><table><thead><tr><th>Q</th><th>Score</th><th></th></tr></thead><tbody>${a.items.map((it) => `<tr><td>${esc(it.label)}</td><td>${it.score}/${it.marks}</td><td><a href="#/written/${it.qid}">${t('আবার চেষ্টা', 'Retry')}</a></td></tr>`).join('')}</tbody></table></div>`;
  }
  view.innerHTML = `<div class="page-head"><p class="small"><a href="#/results">${t('সব ফলাফল', 'All results')}</a></p><h1>${esc(a.title || a.kind)}</h1><p>${new Date(a.createdAt).toLocaleString()}</p></div>${body}`;
}
