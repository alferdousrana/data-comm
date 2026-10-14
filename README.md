# DataComm Academy — My Personal Data Communications Tutor

**CSE 311 — Data Communications · Green University of Bangladesh**
*Learn in Bangla. Understand deeply. Answer in English. Master the exam.*

A static, installable, offline-first study app in vanilla HTML/CSS/JavaScript (ES modules, no framework, no build step). It runs on GitHub Pages, and Firebase sync is optional.

---

## 1. What is in this release (content batch 1)

| | Status |
|---|---|
| Full lessons (Bangla explanation, slide definitions, visuals, solved examples, “Write This in the Exam”, keywords, mistakes, revision, 10 MCQs, rubric-marked written questions) | **11**: switching, topology, addressing & message journey, composite signals & bandwidth, digital signals & transmission time, Nyquist/Shannon/SNR, line coding, B8ZS/HDB3, bit vs baud rate, ASK/FSK/PSK, guided media |
| Outline lessons (slide key points only, clearly labelled) | **16**, covering the rest of Forouzan Ch 1–7 and Kurose & Ross Ch 7 |
| Midterm replica (Summer 2026, 30 marks, same OR choices) | ✓ |
| Numerical generators | 12 topics |
| Simulators | Line coding (9 schemes incl. B8ZS/HDB3), ASK/FSK/PSK, frequency domain, message journey, labelling (fiber, OSI) |

Every midterm question maps to a full lesson.

### Source-file findings (please act on these)
- **`Chapter_6_Kurose_Ross_v8_2.pptx` is a duplicate.** It contains the Chapter 7 *Wireless and Mobile Networks* slides, not Chapter 6 *Link Layer and LANs*. The Link Layer chapter therefore has no lessons. Upload the correct deck to add them.
- **Transmission Media came up in the midterm.** Forouzan Ch 7 appeared in Summer 2026 Q1(a), even though the midterm was described as Ch 1–5. It defaults to *Final* and is flagged. Change it in **Settings → Syllabus**.
- **Interpretations are flagged inside lessons.** Examples: the NRZ-I reference level, the FSK frequencies in Q3(b), and a slide arithmetic slip in Example 4.4.
- **Supplementary material is labelled.** Anything not on the slides, such as the fiber-vs-twisted-pair advantages and ASK/PSK power efficiency, is marked *Supplementary*.

---

## 2. Run locally

```bash
cd datacomm-academy
python3 -m http.server 8080        # or: npm run serve
# open http://localhost:8080/
```

A service worker needs `http://localhost` or HTTPS. Opening `index.html` as a `file://` page will not work.

## 3. Tests

```bash
npm test             # 60 unit/content tests (Node ≥ 20, no install needed)
npm run test:e2e     # browser workflow + offline test (pip install playwright; playwright install chromium)
                     #   BASE=http://localhost:8080/ npm run test:e2e
npm install && npm run test:rules   # Firestore rules tests (needs Java 11+, downloads the emulator)
```

---

## 4. Deploy to GitHub Pages

1. **Create a repository** on GitHub, e.g. `datacomm-academy`. A private repository is recommended for course material, but Pages on a private repository needs a paid plan, so choose based on what your instructor prefers.
2. **Push the project.**
   ```bash
   git init && git add . && git commit -m "DataComm Academy"
   git branch -M main
   git remote add origin https://github.com/USERNAME/datacomm-academy.git
   git push -u origin main
   ```
3. **Turn on Pages.** Go to Settings → Pages → *Deploy from a branch* → `main` / `/ (root)`.
4. **Base path:** nothing to configure. All paths are relative, so `https://USERNAME.github.io/datacomm-academy/` works as is.
5. **HTTPS** is automatic on `github.io`. Tick *Enforce HTTPS* if it is shown.
6. **Install the app.**
   - Android Chrome: menu → *Install app*.
   - iPhone Safari: Share → *Add to Home Screen*.
   - Desktop Chrome/Edge: the install icon in the address bar.
7. **Test offline.**
   1. Open the site online.
   2. Go to **Settings → Download for offline study**.
   3. Switch to airplane mode and reopen the app.
   4. Lessons, quizzes, written answers and evaluation all work offline.
8. **Updating the app.**
   1. Change files and bump `VERSION` in `service-worker.js`.
   2. Push the changes.
   3. Users see an *Update* banner.

   Progress lives in IndexedDB and is never stored in the replaced caches, so it survives updates.

## 5. Optional: Firebase (accounts + cloud sync)

Without Firebase the app is fully functional as a single-device guest app.

1. **Create a project** at <https://console.firebase.google.com>.
2. **Register a web app.** Go to Project settings → *Your apps* → Web, then copy the config object into `js/firebase/config.js` (`export const firebaseConfig = {...}`). This config is an identifier, not a secret. Security comes from the rules.
3. **Enable sign-in methods.** Go to Authentication → Sign-in method → enable **Google** and/or **Email/Password**.
4. **Add authorized domains.** Go to Authentication → Settings → Authorized domains → add `USERNAME.github.io`.
5. **Create the database.** Go to Firestore Database → Create database (production mode, nearest region).
6. **Deploy the rules.**
   ```bash
   npm install -g firebase-tools@13.29.1
   firebase login
   firebase use --add            # pick your project
   firebase deploy --only firestore:rules
   ```
7. **Optional: App Check.** Create a reCAPTCHA v3 key, enable App Check for Firestore, and put the site key in `appCheckSiteKey` in `config.js`.
8. **Course content seeding: not required.** The app reads course data from the bundled `data/*.json`. The rules still allow an admin-only public mirror (`lessons`, `questions`, …) if you want one later. Admin status can only come from a custom claim set with the Admin SDK on a trusted machine.

### Data model
`users/{uid}/attempts|progress|notes|bookmarks|revision|ledger|activity|settings/{id}`

Only the owner can read or write these. Attempts are append-only, field types and sizes are validated, and XP entries are capped.

### Sync and conflict policy
- **Every write goes to the device first.** It is saved to IndexedDB, then added to a durable queue with a stable key.
- **The queue is flushed at these moments:** app start, reconnecting, sign-in, returning to the tab, and every 30 s while the app is open.
  - `navigator.onLine` is treated only as a hint.
  - Failed writes stay queued and retry with exponential backoff, capped at 5 minutes.
  - Nothing local is deleted on failure.
- **Writes are idempotent.** The document id is the record id, written with `setDoc(merge)`, so a re-sent write never creates a duplicate.
- **How records are merged:**
  - **attempts:** append-only union; never overwritten.
  - **progress:** `completed` is OR-ed; read % and best quiz score take the maximum.
  - **notes:** last writer wins, but the replaced text is kept in `history`.
  - **settings, revision, bookmarks:** last writer wins by `updatedAt`.
  - **XP ledger:** union by key, so XP is never paid twice.
- **Guest → account.** On first sign-in, the app asks before uploading this device's guest data. If the device is already linked to a *different* account, it refuses to upload silently and asks you to use export/import.
- **Drawings** stay on the device; they are too large for Firestore documents.

### Optional AI evaluation (server-side only)
`functions/index.js` is an **untested starting point**. It verifies the Firebase ID token, applies a 30-per-day per-user limit, keeps the key as a secret, and schema-checks the model's output.

```bash
cd functions && npm install && cd ..
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase deploy --only functions
```

Then paste the function URL into **Settings → AI evaluation endpoint**. The frontend never contains an API key. If the endpoint is unset or offline, local rubric marking is used and the UI says which method marked the answer.

---

## 6. Architecture

```
index.html, offline.html, manifest.webmanifest, service-worker.js
css/        tokens · base · layout · components · lessons
js/app.js   bootstrap, shell, service-worker registration, study timer
js/router.js  hash router (works on any sub-path)
js/state.js   app state + settings defaults
js/storage/   db.js (IndexedDB) · repo.js (all writes → local + sync queue, XP, stats)
js/sync/      engine.js (queue flush, backoff, guest migration, merge)
js/firebase/  config.js (template) · client.js (lazy CDN SDK 10.12.2)
js/lessons/   content.js (lazy JSON loading, offline download)
js/evaluation/ rubric-evaluator.js (offline marking) · ai-client.js (optional)
js/numerics/  formulas.js · generators.js
js/simulators/ linecoding.js · render.js · widgets.js
js/revision/  scheduler.js        js/gamification/ rules.js
js/ui/        dom.js · diagrams.js (original SVG) · feedback.js · pages/*
data/         course-manifest.json · syllabus.json · lessons/*.json · question-banks/*.json
firebase/     firestore.rules · firestore.indexes.json
functions/    optional AI evaluator
tests/        unit (*.test.js) · e2e/e2e.py · rules/*.spec.mjs
```

### How written answers are marked (offline)
Each question has a rubric made of criteria. Each criterion type works as follows:

| Criterion type | What it checks |
|---|---|
| `concepts` | Synonym phrases, with a negation check, stemming and partial credit |
| `numeric` | Unit-aware value with tolerance; correct value without its unit loses a unit share |
| `formula` | Pattern match for the required formula |
| `choice` | The answer commits to the correct option, not both |
| `sequence` | Waveform levels, checked symbol by symbol |
| `spikes` | Frequency-domain components and their amplitudes |
| `selfcheck` | Drawn diagrams; scored from your ticked checklist and reported as **self-assessed** |

Two guards protect the marking:
- **Brevity guard:** keyword-only answers cannot reach full marks.
- **Misconception penalties:** common wrong statements deduct marks.

The engine matches meaning only through its synonym lists. It may miss an unusual but correct paraphrase, and the UI says so.

### Adding content (next batches)
1. Write `data/lessons/<id>.json`, using any complete lesson as the template.
2. Write `data/question-banks/<id>.json` with exactly 10 MCQs and a rubric for each written question.
3. Add the lesson to `data/course-manifest.json`.
4. Run `npm test`. It validates schemas and answer keys, and it fails if a model answer does not score full marks under its own rubric.
5. Bump the service-worker `VERSION`.

---

## 7. Verification status (honest)

**Verified in this build** (headless Chromium, app served from a sub-path like GitHub Pages):
- **60 unit and content tests:**
  - Formulas and units, including your midterm results: 12 kbps; 0.15 s / 0.008 s / 1600 s; SNR = 2²⁵ − 1 ≈ 75.26 dB.
  - Every line-coding scheme against the slide figures, including B8ZS Q3(a) and HDB3 Fig 4.20.
  - The evaluator, scheduler and badges.
  - Every model answer scoring full marks under its own rubric.
  - The precache list being complete, and no root-absolute paths.
- **36 end-to-end checks:**
  - Onboarding, lesson completion with XP, the quiz (answers hidden until submit, double-submit blocked).
  - Written marking (a strong answer scores 2/2; a keyword-only answer scores 1.25/2), plus waveform, B8ZS and numerical answers.
  - All simulators, real dashboard statistics, badges awarded only when earned, the revision queue.
  - Export, and import into a fresh device; re-import adds nothing; an invalid file is rejected.
  - The theme persists across reloads.
  - The offline cycle: download → offline reload → open lesson → evaluate locally → close and reopen → data kept → mock exam with a recovered draft.
- **No horizontal overflow at 360 px width** on 11 key pages; dark mode was checked.

**Not verified** (requires your Firebase project or network access this build environment did not have):
- Firebase sign-in, Firestore sync, guest migration against a real project.
- `firestore.rules`: written with a test suite (`npm run test:rules`), but the emulator could not be downloaded here, so they have **not been executed**. Run that test before relying on them.
- The optional Cloud Function (`functions/`): never deployed or run.
- A real GitHub Pages deployment and installation on physical phones.
- Google Fonts loading. The sandbox had no internet; the app falls back to system fonts.
