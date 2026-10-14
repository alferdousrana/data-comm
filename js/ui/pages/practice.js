import { state, t, uid } from '../../state.js';
import { allProgress, saveAttempt, awardXp, checkBadges, markWrong, markRight } from '../../storage/repo.js';
import { generate, checkPart, TOPICS } from '../../numerics/generators.js';
import { XP, xpKey } from '../../gamification/rules.js';
import { mountSim } from '../../simulators/widgets.js';
import { esc, $, $$, toast, beep } from '../dom.js';
import { navigate } from '../../router.js';

export default async function practice(view) {
  const ls = state.manifest.lessons.filter((l) => l.status === 'complete');
  const prog = Object.fromEntries((await allProgress()).map((p) => [p.lessonId, p]));
  const tile = (href, title, sub) => `<a class="card" href="${href}" style="text-decoration:none;color:inherit;display:block"><h3>${title}</h3><p class="small muted" style="margin:0">${sub}</p></a>`;
  view.innerHTML = `<div class="page-head"><h1>${t('অনুশীলন কেন্দ্র', 'Practice centre')}</h1><p>${t('শেখো → সমাধান করো → জমা দাও → নম্বর পাও → ভুল ঠিক করো', 'Learn → solve → submit → get marks → fix mistakes')}</p></div>
  <div class="grid two">
    ${tile('#/exam', t('মক পরীক্ষা', 'Mock examination'), t('তোমার Summer 2026 মিডটার্মের প্রতিরূপ, সময়সহ', 'A timed replica of your Summer 2026 midterm'))}
    ${tile('#/quiz/revision', t('দুর্বল বিষয়ের অনুশীলন', 'Weak-topic practice'), t('যেসব MCQ ভুল করেছ সেগুলো আবার', 'MCQs you previously got wrong'))}
    ${tile('#/practice/written', t('লিখিত ও তুলনামূলক প্রশ্ন', 'Written & compare-and-contrast'), t('রুব্রিক-ভিত্তিক মূল্যায়ন ও ফিডব্যাক', 'Rubric-based marking with feedback'))}
    ${tile('#/sim/linecoding', t('ওয়েভফর্ম ও ডায়াগ্রাম', 'Waveforms & diagrams'), t('লাইন কোডিং, ASK/FSK/PSK, স্পেকট্রাম, মেসেজ যাত্রা, লেবেলিং', 'Line coding, ASK/FSK/PSK, spectrum, message journey, labelling'))}
  </div>
  <h2 style="margin-top:1.5rem">${t('গাণিতিক সমস্যা ও সূত্র অনুশীলন', 'Numerical problems & formula practice')}</h2>
  <div class="grid three">${Object.entries(TOPICS).map(([k, v]) => tile(`#/practice/numeric/${k}`, esc(v.title), `<span class="bn">${esc(v.titleBn)}</span><br>${esc(v.source)}`)).join('')}</div>
  <h2 style="margin-top:1.5rem">${t('অধ্যায়ভিত্তিক MCQ টেস্ট', 'Chapter-wise MCQ tests')}</h2>
  <div class="card"><ul class="list">${ls.map((l) => `<li class="row between"><a href="#/quiz/${l.id}">${esc(l.title)}</a><span class="chip ${prog[l.id]?.quizBest >= 80 ? 'ok' : ''}">${prog[l.id]?.quizBest != null ? `best ${prog[l.id].quizBest}%` : '10 MCQs'}</span></li>`).join('')}</ul></div>`;
}

export async function numeric(view, { topic }) {
  const meta = TOPICS[topic];
  if (!meta) { view.innerHTML = '<div class="empty">Unknown topic</div>'; return; }
  let p = generate(topic, Math.floor(Math.random() * 1e9));
  let done = false;
  const draw = () => {
    done = false;
    view.innerHTML = `<div class="page-head"><p class="small"><a href="#/practice">${t('অনুশীলন', 'Practice')}</a></p><h1>${esc(meta.title)}</h1><p class="bn">${esc(meta.titleBn)}</p></div>
      <div class="card raised"><p><b>${esc(p.prompt)}</b></p><p class="bn small muted">${esc(p.promptBn)}</p><p class="small muted">Source: ${esc(p.source)}</p></div>
      <form class="card" style="margin-top:1rem" id="nf">${p.parts.map((pt, i) => `<label class="field"><span>${esc(pt.label)}${pt.unit ? ` <span class="small muted">(${t('একক লেখো, যেমন', 'include the unit, e.g.')} ${esc(pt.unit)})</span>` : ''}</span><input type="text" name="p${i}" autocomplete="off" inputmode="decimal"></label><p data-r="${i}" class="small"></p>`).join('')}
        <p class="small muted">${t('সমতুল্য রূপ গ্রহণযোগ্য: 12000 bps, 12 kbps, 3.36×10^7, 33,554,431। ছোটখাটো রাউন্ডিং (~১%) চলবে।', 'Equivalent forms accepted: 12000 bps, 12 kbps, 3.36×10^7, 33,554,431. Small rounding (~1%) is accepted.')}</p>
        <div class="row"><button class="btn primary" type="submit">${t('উত্তর যাচাই', 'Check answer')}</button><button class="btn" type="button" data-new>${t('নতুন সমস্যা', 'New problem')}</button>${meta.lessonId ? `<a class="btn ghost" href="#/lesson/${meta.lessonId}">${t('সূত্র পড়ো', 'Read the formula')}</a>` : ''}</div></form>
      <div id="sol" aria-live="polite"></div>`;
    $('[data-new]', view).onclick = () => { p = generate(topic, Math.floor(Math.random() * 1e9)); draw(); };
    $('#nf', view).addEventListener('submit', async (e) => {
      e.preventDefault();
      if (done) return;
      const inputs = p.parts.map((_, i) => $(`[name="p${i}"]`, view).value);
      if (inputs.every((v) => !v.trim())) { toast(t('আগে উত্তর লেখো', 'Enter an answer first')); return; }
      done = true;
      const checks = p.parts.map((pt, i) => checkPart(pt, inputs[i]));
      checks.forEach((c, i) => {
        $(`[data-r="${i}"]`, view).innerHTML = c.correct ? (c.unitOk ? `<span class="verdict ok">✓ ${t('সঠিক', 'Correct')}</span>` : `<span class="verdict ok">✓ ${t('মান সঠিক', 'Value correct')}</span> — ${t('একক লেখোনি/অস্পষ্ট', 'unit missing or unclear')}`) : `<span class="verdict bad">✗ ${t('সঠিক নয়', 'Not correct')}</span> — ${t('প্রত্যাশিত', 'expected')} ${esc(p.parts[i].display)}`;
      });
      const allCorrect = checks.every((c) => c.correct);
      beep(allCorrect, state.settings.sound);
      await saveAttempt({ id: uid('num'), kind: 'numeric', topic, problemId: p.id, title: `Numerical: ${meta.title}`, inputs, allCorrect, lessonId: meta.lessonId });
      let xp = 0;
      if (allCorrect) { xp = await awardXp(xpKey.numericSolved(p.id), XP.numericSolved, `Solved ${meta.title}`); await markRight('numeric', topic); }
      else await markWrong('numeric', topic, meta.lessonId, meta.title);
      const badges = await checkBadges();
      $('#sol', view).innerHTML = `<div class="card" style="margin-top:1rem"><h3>${t('পূর্ণ সমাধান', 'Full solution')}</h3><ol>${p.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>${p.noteBn ? `<p class="bn small">💡 ${esc(p.noteBn)}</p>` : ''}${xp ? `<p class="small">+${xp} XP</p>` : ''}${badges.map((b) => `<p>🏅 ${esc(b.name)}</p>`).join('')}</div>`;
    });
  };
  draw();
}

const SIMS = [
  ['linecoding', 'Line coding & scrambling'], ['modulation', 'ASK / FSK / PSK'], ['spectrum', 'Frequency domain'],
  ['journey', 'Message journey (hops)'], ['label', 'Diagram labelling'],
];
export async function sims(view, { id }) {
  if (!SIMS.some(([k]) => k === id)) { navigate('/sim/linecoding'); return; }
  view.innerHTML = `<div class="page-head"><h1>${t('সিমুলেটর', 'Simulators')}</h1><p>${t('মান বদলে দেখো সিগন্যাল কীভাবে বদলায়। প্যারামিটারগুলো উদাহরণ — পরীক্ষায় প্রশ্নের দেওয়া মান ব্যবহার করবে।', 'Change values and watch the signal. Parameters are illustrative — in an exam use the values given in the question.')}</p></div>
    <div class="tabs" role="tablist">${SIMS.map(([k, n]) => `<button role="tab" aria-selected="${k === id}" data-tab="${k}">${n}</button>`).join('')}</div>
    <div id="sim"></div>${id === 'label' ? '<div id="sim2" style="margin-top:1rem"></div>' : ''}`;
  $$('[data-tab]', view).forEach((b) => b.addEventListener('click', () => navigate(`/sim/${b.dataset.tab}`)));
  mountSim($('#sim', view), id, id === 'label' ? { diagram: 'fiber' } : {});
  if (id === 'label') mountSim($('#sim2', view), 'label', { diagram: 'osi' });
}
