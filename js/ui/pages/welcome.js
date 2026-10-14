import { state } from '../../state.js';
import { saveSettings } from '../../storage/repo.js';
import { esc, $ } from '../dom.js';
import { isConfigured } from '../../firebase/client.js';

export default async function welcome(view) {
  const s = state.settings;
  view.innerHTML = `<div class="stack" style="max-width:640px">
    <div class="card raised">
      <svg viewBox="0 0 320 60" width="100%" style="max-width:320px" aria-hidden="true"><path d="M0 40h40V12h40v36h40V12h40v28h40V12h40v36h40V40" fill="none" stroke="var(--trace)" stroke-width="4" stroke-linejoin="round"/></svg>
      <h1>DataComm Academy</h1>
      <p><b>CSE 311 — Data Communications</b><br>Green University of Bangladesh</p>
      <p class="bn">বাংলায় শেখো, গভীরভাবে বোঝো, ইংরেজিতে উত্তর লেখো।</p>
      <p class="muted">Learn in Bangla. Understand deeply. Answer in English. Master the exam.</p>
    </div>
    <div class="card">
      <h3>কীভাবে কাজ করে</h3>
      <ol>
        <li>লেসন পড়ো — বাংলা ব্যাখ্যা, স্লাইডের সংজ্ঞা, চিত্র ও সমাধান করা উদাহরণ।</li>
        <li>১০টি MCQ ও পরীক্ষার ধরনের লিখিত প্রশ্ন সমাধান করো।</li>
        <li>রুব্রিক অনুযায়ী নম্বর ও ফিডব্যাক পাও, ভুল থেকে রিভিশন তালিকা তৈরি হয়।</li>
        <li>মক পরীক্ষা দাও — তোমার মিডটার্ম প্রশ্নপত্রের ধরনে।</li>
      </ol>
      <p class="small muted">Everything is saved on this device first, so you can study offline. ${isConfigured() ? 'Sign in later (Settings) to sync between devices.' : 'Cloud sync becomes available once Firebase is configured (see README).'}</p>
    </div>
    <form class="card" id="setup">
      <h3>Quick setup <span class="muted small">(optional)</span></h3>
      <div class="grid two">
        <label class="field"><span>Final exam date</span><input type="date" name="final" value="${esc(s.examDates.final)}"></label>
        <label class="field"><span>Daily goal (minutes)</span><input type="number" name="goal" min="5" max="300" value="${s.dailyGoalMin}"></label>
      </div>
      <label class="field"><span>Interface labels</span><select name="lang"><option value="bn" ${s.uiLang === 'bn' ? 'selected' : ''}>বাংলা</option><option value="en" ${s.uiLang === 'en' ? 'selected' : ''}>English</option></select></label>
      <p class="small muted">Syllabus: Forouzan Ch 1–5 are set as midterm and the rest as final, with flags where your files disagree. You can change this any time in Settings → Syllabus.</p>
      <div class="row"><button class="btn primary" type="submit">Start as guest</button>${isConfigured() ? '<a class="btn" href="#/settings" data-signin>Sign in</a>' : ''}</div>
    </form>
  </div>`;
  $('#setup', view).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    await saveSettings({ onboarded: true, dailyGoalMin: Math.max(5, Math.min(300, Number(f.get('goal')) || 30)), uiLang: f.get('lang'), examDates: { ...s.examDates, final: f.get('final') || '' } });
    location.hash = '/';
  });
  $('[data-signin]', view)?.addEventListener('click', () => saveSettings({ onboarded: true }));
}
