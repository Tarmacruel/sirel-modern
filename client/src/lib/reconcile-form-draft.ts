/** Refresh untouched fields while preserving edits made since the last server snapshot. */
export function reconcileFormDraft<T extends object>(
  current: T,
  incoming: T,
  previous?: T,
): T {
  if (!previous) return incoming;
  const next = { ...incoming };
  for (const key of Object.keys(incoming) as (keyof T)[]) {
    if (current[key] !== previous[key]) next[key] = current[key];
  }
  return next;
}
