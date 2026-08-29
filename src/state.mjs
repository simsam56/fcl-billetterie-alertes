export function emptyState() {
  return {
    version: 1,
    initializedAt: null,
    updatedAt: null,
    seen: [],
  };
}

export async function processDetectedSales({
  urls,
  state,
  notify,
  now = () => new Date().toISOString(),
}) {
  const normalized = [...new Set(urls)].sort();
  if (!state.initializedAt) {
    const timestamp = now();
    return {
      state: {
        version: 1,
        initializedAt: timestamp,
        updatedAt: timestamp,
        seen: normalized,
      },
      initialized: true,
      notified: [],
      failures: [],
    };
  }

  const seen = new Set(state.seen);
  const notified = [];
  const failures = [];
  for (const url of normalized.filter((candidate) => !seen.has(candidate))) {
    try {
      await notify(url);
      seen.add(url);
      notified.push(url);
    } catch (error) {
      failures.push({
        url,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const changed = notified.length > 0;
  return {
    state: changed
      ? {
          ...state,
          updatedAt: now(),
          seen: [...seen].sort(),
        }
      : state,
    initialized: false,
    notified,
    failures,
  };
}
