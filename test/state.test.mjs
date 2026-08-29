import test from "node:test";
import assert from "node:assert/strict";

import { emptyState, processDetectedSales } from "../src/state.mjs";

const first = "https://billetterie.fclorient.bzh/fr/catalogue/match-foot-masculin-fc-lorient-paris-fc";
const second = "https://billetterie.fclorient.bzh/fr/catalogue/match-foot-masculin-rc-lens-fc-lorient";
const now = () => "2026-08-29T20:00:00.000Z";

test("le premier contrôle initialise sans notifier", async () => {
  const calls = [];
  const result = await processDetectedSales({
    urls: [first],
    state: emptyState(),
    notify: async (url) => calls.push(url),
    now,
  });

  assert.equal(result.initialized, true);
  assert.deepEqual(result.notified, []);
  assert.deepEqual(calls, []);
  assert.deepEqual(result.state.seen, [first]);
});

test("une vente nouvelle est notifiée une seule fois", async () => {
  const baseline = (
    await processDetectedSales({
      urls: [first],
      state: emptyState(),
      notify: async () => {},
      now,
    })
  ).state;
  const calls = [];
  const opened = await processDetectedSales({
    urls: [first, second],
    state: baseline,
    notify: async (url) => calls.push(url),
    now,
  });
  const repeated = await processDetectedSales({
    urls: [first, second],
    state: opened.state,
    notify: async (url) => calls.push(url),
    now,
  });

  assert.deepEqual(opened.notified, [second]);
  assert.deepEqual(repeated.notified, []);
  assert.deepEqual(calls, [second]);
  assert.strictEqual(repeated.state, opened.state);
});

test("un échec ntfy laisse la vente à retenter", async () => {
  const baseline = (
    await processDetectedSales({
      urls: [first],
      state: emptyState(),
      notify: async () => {},
      now,
    })
  ).state;
  const result = await processDetectedSales({
    urls: [first, second],
    state: baseline,
    notify: async () => {
      throw new Error("ntfy indisponible");
    },
    now,
  });

  assert.equal(result.failures.length, 1);
  assert.equal(result.state.seen.includes(second), false);
  assert.strictEqual(result.state, baseline);
});
