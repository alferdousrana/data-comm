// Firestore Security Rules tests. NOT run in the default `npm test`.
// Requires Java 11+ and the emulator:  npm run test:rules
// (firebase emulators:exec starts the Firestore emulator, runs this file, then stops it.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'datacomm-rules-test',
  firestore: { rules: readFileSync(new URL('../../firebase/firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});
const alice = env.authenticatedContext('alice').firestore();
const bob = env.authenticatedContext('bob').firestore();
const anon = env.unauthenticatedContext().firestore();
const attempt = { id: 'att_1', kind: 'written', createdAt: 1, title: 'x', questionId: 'sw-w1', lessonId: 'ch1-switching', answer: { text: 'circuit switching' } };

test('owner can create and read own attempt', async () => {
  await assertSucceeds(setDoc(doc(alice, 'users/alice/attempts/att_1'), attempt));
  await assertSucceeds(getDoc(doc(alice, 'users/alice/attempts/att_1')));
});
test('another user cannot read or write it', async () => {
  await assertFails(getDoc(doc(bob, 'users/alice/attempts/att_1')));
  await assertFails(setDoc(doc(bob, 'users/alice/attempts/att_2'), { ...attempt, id: 'att_2' }));
  await assertFails(getDoc(doc(anon, 'users/alice/attempts/att_1')));
});
test('attempts are append-only', async () => {
  await assertFails(updateDoc(doc(alice, 'users/alice/attempts/att_1'), { title: 'edited' }));
  await assertFails(deleteDoc(doc(alice, 'users/alice/attempts/att_1')));
});
test('oversized answers and bad kinds are rejected', async () => {
  await assertFails(setDoc(doc(alice, 'users/alice/attempts/att_big'), { ...attempt, id: 'att_big', answer: { text: 'x'.repeat(20001) } }));
  await assertFails(setDoc(doc(alice, 'users/alice/attempts/att_k'), { ...attempt, id: 'att_k', kind: 'admin' }));
});
test('XP ledger entries are capped', async () => {
  await assertSucceeds(setDoc(doc(alice, 'users/alice/ledger/lesson:x:complete'), { key: 'lesson:x:complete', kind: 'xp', amount: 20 }));
  await assertFails(setDoc(doc(alice, 'users/alice/ledger/hack'), { key: 'hack', kind: 'xp', amount: 99999 }));
});
test('unknown private collections are rejected', async () => {
  await assertFails(setDoc(doc(alice, 'users/alice/roles/me'), { admin: true }));
});
test('clients cannot write course content or self-grant admin', async () => {
  await assertSucceeds(getDoc(doc(anon, 'lessons/ch1-switching')));
  await assertFails(setDoc(doc(alice, 'lessons/ch1-switching'), { title: 'hacked' }));
  await assertFails(setDoc(doc(alice, 'users/alice'), { displayName: 'a', admin: true }));
});
test.after(async () => { await env.cleanup(); });
