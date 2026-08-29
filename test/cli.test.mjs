import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runCli({ args, env }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/run-monitor.mjs", ...args], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("le CLI initialise une fois sans afficher le sujet ntfy", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fcl-monitor-"));
  const fixture = join(directory, "page.html");
  const statePath = join(directory, "seen.json");
  const secret = "topic-super-secret-for-test";
  await writeFile(
    fixture,
    `<h1>BILLETTERIE OFFICIELLE FC LORIENT</h1>
      <a href="/fr/catalogue/match-foot-masculin-fc-lorient-paris-fc">Réserver</a>`,
  );

  const run = () =>
    runCli({
      args: ["check", "--state", statePath],
      env: {
        FCL_FIXTURE_PATH: fixture,
        NTFY_TOPIC: secret,
      },
    });

  try {
    const first = await run();
    const initialState = await readFile(statePath, "utf8");
    const second = await run();

    assert.equal(first.code, 0);
    assert.equal(second.code, 0);
    assert.equal(await readFile(statePath, "utf8"), initialState);
    assert.doesNotMatch(
      `${first.stdout}${first.stderr}${second.stdout}${second.stderr}`,
      new RegExp(secret),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("le mode inspect ne demande pas de secret ntfy", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fcl-inspect-"));
  const fixture = join(directory, "page.html");
  await writeFile(
    fixture,
    `<h1>BILLETTERIE OFFICIELLE FC LORIENT</h1>
      <a href="/fr/catalogue/match-foot-masculin-rc-lens-fc-lorient">Réserver</a>`,
  );

  try {
    const result = await runCli({
      args: ["inspect"],
      env: { FCL_FIXTURE_PATH: fixture, NTFY_TOPIC: "" },
    });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /1 vente\(s\) détectée\(s\)/);
    assert.match(result.stdout, /rc-lens-fc-lorient/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
