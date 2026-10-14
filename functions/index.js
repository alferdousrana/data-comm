// OPTIONAL server-side AI evaluator for long written answers.
// STATUS: provided as a starting point; NOT deployed or tested by the app author.
// The app works fully without it (local rubric evaluation).
//
// Security model:
//  - The AI provider key is a Firebase secret (never in frontend code):
//      firebase functions:secrets:set ANTHROPIC_API_KEY
//  - Every request must carry a Firebase ID token; anonymous calls are rejected.
//  - Per-user rate limit (default 30 evaluations/day) stored in Firestore.
//  - Input sizes are capped and the model output is schema-validated before returning.
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp();
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const DAILY_LIMIT = 30;
const ALLOWED_ORIGINS = [/^https:\/\/[a-z0-9-]+\.github\.io$/i, /^http:\/\/localhost(:\d+)?$/];

export const evaluate = onRequest({ secrets: [ANTHROPIC_API_KEY], region: 'asia-south1', maxInstances: 3 }, async (req, res) => {
  const origin = req.get('origin') || '';
  if (ALLOWED_ORIGINS.some((r) => r.test(origin))) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); }
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  let uid;
  try { uid = (await getAuth().verifyIdToken(String(req.get('authorization') || '').replace(/^Bearer /, ''))).uid; }
  catch { res.status(401).json({ error: 'unauthenticated' }); return; }

  const { question, marks, rubric, answer } = req.body || {};
  if (typeof question !== 'string' || typeof answer !== 'string' || typeof marks !== 'number' || marks <= 0 || marks > 10 || !rubric) { res.status(400).json({ error: 'bad request' }); return; }
  if (question.length > 4000 || answer.length > 8000 || JSON.stringify(rubric).length > 20000) { res.status(413).json({ error: 'too large' }); return; }

  const day = new Date().toISOString().slice(0, 10);
  const counter = getFirestore().doc(`aiUsage/${uid}_${day}`);
  const allowed = await getFirestore().runTransaction(async (tx) => {
    const n = (await tx.get(counter)).data()?.count || 0;
    if (n >= DAILY_LIMIT) return false;
    tx.set(counter, { count: FieldValue.increment(1), uid, day }, { merge: true });
    return true;
  });
  if (!allowed) { res.status(429).json({ error: 'daily limit reached' }); return; }

  const prompt = `You are a strict but fair university examiner for CSE 311 Data Communications.
Mark the student's answer out of ${marks} using ONLY this rubric (JSON): ${JSON.stringify(rubric.criteria)}
Accept correct paraphrases. Do not reward keyword lists without explanation.
Question: ${question}
Student answer: """${answer}"""
Reply with JSON only: {"score": number, "criteria":[{"label":string,"earned":number,"comment":string}], "feedback": string}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY.value(), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await r.json();
    const text = (data.content || []).map((c) => c.text || '').join('').replace(/```json|```/g, '').trim();
    const out = JSON.parse(text);
    if (typeof out.score !== 'number' || out.score < 0 || out.score > marks || !Array.isArray(out.criteria)) throw new Error('schema');
    res.json({ score: Math.round(out.score * 4) / 4, criteria: out.criteria.slice(0, 20), feedback: String(out.feedback || '').slice(0, 4000) });
  } catch (e) {
    res.status(502).json({ error: 'evaluation unavailable' });
  }
});
