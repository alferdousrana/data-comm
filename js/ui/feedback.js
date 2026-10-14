import { esc, md } from './dom.js';
import { t } from '../state.js';

export function feedbackHtml(q, result, { ai = null, showModel = true } = {}) {
  const sa = result.selfAssessed;
  const list = (arr, fn) => (arr.length ? `<ul>${arr.map(fn).join('')}</ul>` : `<p class="muted small">${t('কিছু নেই', 'None')}</p>`);
  return `<section class="card raised" aria-labelledby="fb-h">
    <div class="row between"><h3 id="fb-h">${t('মূল্যায়ন', 'Evaluation')}</h3>
      <span class="chip ${result.percent >= 80 ? 'ok' : result.percent >= 50 ? 'im' : 'vi'}">${result.percent}%</span></div>
    <p class="score-big">${t('স্কোর', 'Score')}: ${result.score} / ${result.total}</p>
    ${ai ? `<div class="callout info"><b>${t('সার্ভার-ভিত্তিক AI মূল্যায়ন', 'Server AI evaluation')}: ${ai.score} / ${result.total}</b><br>${esc(ai.feedback)}</div>` : ''}
    <p class="small muted">${t('পদ্ধতি: লোকাল রুব্রিক মূল্যায়ন — নির্দিষ্ট ধারণা, সমার্থক শব্দ, সূত্র, সংখ্যা ও একক মিলিয়ে দেখে। অস্বাভাবিক কিন্তু সঠিক বাক্যগঠন সবসময় চিনতে পারে না।', 'Method: local rubric evaluation — matches expected concepts, synonyms, formulas, numbers and units. It may miss an unusual but correct paraphrase.')}${sa ? ` <b>${t('ডায়াগ্রামের অংশ তোমার নিজের টিক দেওয়া চেকলিস্ট দিয়ে (self-assessed)।', 'Diagram parts are self-assessed from your checklist.')}</b>` : ''}</p>
    ${result.guardNote ? `<div class="callout warn">${esc(result.guardNote.en)}<br><span class="bn">${esc(result.guardNote.bn)}</span></div>` : ''}
    <div class="table-wrap"><table><thead><tr><th>${t('মানদণ্ড', 'Criterion')}</th><th>${t('নম্বর', 'Marks')}</th></tr></thead><tbody>
      ${result.criteria.map((c) => `<tr><td>${esc(c.label)}${c.selfAssessed ? ' <span class="chip">self-assessed</span>' : ''}${c.notes?.length ? `<br><span class="small muted">${esc(c.notes.join('; '))}</span>` : ''}</td><td>${c.earned} / ${c.marks}</td></tr>`).join('')}
      ${result.penalty ? `<tr><td>${t('ভুল ধারণার জন্য কর্তন', 'Deduction for misconception')}</td><td>−${result.penalty}</td></tr>` : ''}
    </tbody></table></div>
    <h4>✓ ${t('যা ঠিক করেছ', 'What you did correctly')}</h4>${list(result.correct, (x) => `<li>${esc(x)}</li>`)}
    <h4>${t('বাদ পড়া গুরুত্বপূর্ণ পয়েন্ট', 'Missing important points')}</h4>${list(result.missing, (m) => `<li>${esc(m.name)}${m.bn ? ` — <span class="bn">${esc(m.bn)}</span>` : ''}</li>`)}
    <h4>${t('ধারণাগত ভুল', 'Conceptual mistakes')}</h4>${list(result.mistakes, (m) => `<li>${esc(m.en)}${m.bn ? `<br><span class="bn small">${esc(m.bn)}</span>` : ''}</li>`)}
    <h4>${t('কীভাবে উন্নতি করবে', 'How to improve')}</h4>${list(result.improve, (x) => `<li>${esc(x)}</li>`)}
    ${showModel ? `<h4>${t('পরীক্ষার জন্য উন্নত উত্তর', 'Exam-ready improved answer')}</h4><div class="exam-answer">${md(q.rubric.modelAnswer)}</div>` : ''}
  </section>`;
}
