// MCQ helpers: shuffle options while keeping the correct answer, and score a quiz.
export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Returns a presentation of the question: options in a new order with `answer` remapped.
export function prepare(q, rand = Math.random) {
  const order = shuffle([0, 1, 2, 3], rand);
  return { ...q, order, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
}

export function scoreQuiz(prepared, chosen) {
  const items = prepared.map((q, i) => ({ id: q.id, chosenOriginal: chosen[i] == null ? null : q.order[chosen[i]], correct: chosen[i] === q.answer }));
  const correct = items.filter((x) => x.correct).length;
  return { items, correct, total: prepared.length, percent: Math.round((correct / prepared.length) * 100) };
}
