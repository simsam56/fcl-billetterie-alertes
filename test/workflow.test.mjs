import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("le workflow est planifié, sérialisé et limite ses permissions", async () => {
  const yaml = await readFile(
    new URL("../.github/workflows/monitor.yml", import.meta.url),
    "utf8",
  );

  assert.match(yaml, /cron: ['"]\*\/5 \* \* \* \*['"]/);
  assert.match(yaml, /workflow_dispatch:/);
  assert.match(yaml, /contents: write/);
  assert.match(yaml, /cancel-in-progress: false/);
  assert.match(yaml, /always\(\).*env\.MODE == 'check'/);
  assert.match(yaml, /NTFY_TOPIC: \$\{\{ secrets\.NTFY_TOPIC \}\}/);
  assert.match(yaml, /ref: state/);
  assert.match(yaml, /timeout-minutes: 5/);
  assert.match(yaml, /persist-credentials: false/);
  assert.doesNotMatch(yaml, /fcl-billets-[a-f0-9]{20,}/);
});

test("un battement mensuel maintient les workflows publics actifs", async () => {
  const yaml = await readFile(
    new URL("../.github/workflows/heartbeat.yml", import.meta.url),
    "utf8",
  );

  assert.match(yaml, /cron: ['"]17 3 1 \* \*['"]/);
  assert.match(yaml, /contents: write/);
  assert.match(yaml, /monitor-heartbeat\.txt/);
  assert.match(yaml, /timeout-minutes: 5/);
});
