export function emptyState() {
  return {
    version: 1,
    initializedAt: null,
    updatedAt: null,
    seen: [],
  };
}

const OFFICIAL_SALE_URL =
  /^https:\/\/billetterie\.fclorient\.bzh\/fr\/catalogue\/match-foot-masculin-[a-z0-9-]+$/;

function validTimestamp(value) {
  return (
    value === null ||
    (typeof value === "string" &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value)
  );
}

export function validateState(state) {
  const valid =
    state !== null &&
    typeof state === "object" &&
    state.version === 1 &&
    validTimestamp(state.initializedAt) &&
    validTimestamp(state.updatedAt) &&
    Array.isArray(state.seen) &&
    state.seen.every(
      (url) => typeof url === "string" && OFFICIAL_SALE_URL.test(url),
    );
  if (!valid) {
    throw new Error("État de surveillance invalide");
  }
  return state;
}

export async function processDetectedSales({
  urls,
  state,
  notify,
  now = () => new Date().toISOString(),
}) {
  validateState(state);
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
