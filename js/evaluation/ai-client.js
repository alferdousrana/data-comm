// Optional AI evaluation through YOUR secure server endpoint (e.g. a Firebase Cloud Function).
// No API key ever lives in the frontend. If no endpoint is configured, or the call fails,
// callers keep the local rubric result and the UI says which method was used.
import { state } from '../state.js';
import { idToken } from '../firebase/client.js';

export const aiAvailable = () => !!(state.settings.aiEndpoint && state.user && navigator.onLine);

export async function aiEvaluate(question, answerText, localResult) {
  if (!aiAvailable()) return null;
  const token = await idToken();
  if (!token) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(state.settings.aiEndpoint, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ questionId: question.id, question: question.question, marks: question.marks, rubric: question.rubric, answer: String(answerText).slice(0, 8000), localScore: localResult.score }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Validate the response schema strictly before trusting it.
    if (typeof data.score !== 'number' || data.score < 0 || data.score > question.marks || !Array.isArray(data.criteria)) return null;
    return { score: Math.round(data.score * 4) / 4, feedback: String(data.feedback || '').slice(0, 4000), criteria: data.criteria.slice(0, 20).map((c) => ({ label: String(c.label || ''), earned: Number(c.earned) || 0, comment: String(c.comment || '') })), method: 'ai-server' };
  } catch { return null; } finally { clearTimeout(timer); }
}
