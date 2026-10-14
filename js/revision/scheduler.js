// Spaced-repetition scheduling. Intervals are suggestions (configurable), not
// scientific guarantees. Pure module.

export const DEFAULT_INTERVALS_DAYS = [0, 1, 3, 7, 14];
const DAY = 86400000;

export function newItem({ id, kind, refId, lessonId, label, now = Date.now() }) {
  return { id, kind, refId, lessonId, label, stage: 0, lapses: 0, reviews: 0, dueAt: now, createdAt: now, updatedAt: now, status: 'learning' };
}

// outcome: 'correct' | 'wrong' | 'understood' | 'difficult' | 'practice'
export function review(item, outcome, { now = Date.now(), intervals = DEFAULT_INTERVALS_DAYS } = {}) {
  const it = { ...item, reviews: (item.reviews || 0) + 1, updatedAt: now, lastOutcome: outcome, lastReviewedAt: now };
  const maxStage = intervals.length - 1;
  switch (outcome) {
    case 'correct': it.stage = Math.min(maxStage, it.stage + 1); break;
    case 'understood': it.stage = Math.min(maxStage, it.stage + 2); break;
    case 'wrong': it.stage = 0; it.lapses += 1; break;
    case 'difficult': it.stage = Math.min(1, it.stage); break;
    case 'practice': it.stage = 0; break;
    default: throw new RangeError(`Unknown outcome ${outcome}`);
  }
  // Repeated lapses pull the item forward: after 2+ lapses the next interval is halved.
  let days = intervals[it.stage];
  if (it.lapses >= 2 && days > 0) days = Math.max(1, Math.floor(days / 2));
  if (outcome === 'difficult') days = 1;
  it.dueAt = now + days * DAY;
  it.status = it.stage >= maxStage && outcome !== 'wrong' ? 'mastered' : 'learning';
  return it;
}

export function isDue(item, now = Date.now()) { return item.status !== 'mastered' && item.dueAt <= now; }

// Order: overdue first (most overdue first), then by lapses (weaker first).
export function buildQueue(items, now = Date.now()) {
  return items
    .filter((i) => isDue(i, now))
    .sort((a, b) => (a.dueAt - b.dueAt) || (b.lapses - a.lapses));
}

export function overdueDays(item, now = Date.now()) { return Math.max(0, Math.floor((now - item.dueAt) / DAY)); }
