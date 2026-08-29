# FC Lorient Ticket Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publier un service GitHub Actions qui détecte toute nouvelle vente de match sur la billetterie officielle du FC Lorient et envoie une seule notification ntfy avec le lien direct.

**Architecture:** Un programme Node.js sans dépendance extrait les liens de vente du HTML officiel, compare ces liens à un état JSON persistant sur une branche GitHub `state`, puis appelle ntfy seulement pour les nouveautés. Un workflow planifié toutes les cinq minutes orchestre les deux checkouts, exécute le programme et pousse l'état mis à jour ; des modes manuels permettent l'inspection et le test de notification.

**Tech Stack:** Node.js 22, test runner natif `node:test`, GitHub Actions, API HTTP ntfy, Git.

**Spec:** `docs/superpowers/specs/2026-08-29-surveillance-billetterie-fcl-design.md`

## Global Constraints

- Le dépôt GitHub final est public et nommé `simsam56/fcl-billetterie-alertes`.
- Le sujet ntfy est fourni uniquement par le secret GitHub `NTFY_TOPIC` et ne doit jamais apparaître dans le dépôt ou les journaux.
- La source surveillée est `https://billetterie.fclorient.bzh/fr/matchs/billets-packs`.
- La fréquence planifiée est `*/5 * * * *` ; GitHub peut retarder une exécution.
- Le premier contrôle initialise la référence sans envoyer d'alerte.
- Une notification réussie est persistée ; une notification échouée reste à retenter.
- Aucun achat, aucune authentification FCL et aucune plateforme de revente non officielle.
- Aucune dépendance npm de production ou de test.

---

### Task 1: Extracteur de ventes et libellés

**Files:**
- Create: `package.json`
- Create: `src/catalogue.mjs`
- Create: `test/catalogue.test.mjs`

**Interfaces:**
- Produces: `extractSaleUrls(html: string, baseUrl?: string): string[]`
- Produces: `labelFromSaleUrl(url: string): string`
- Produces: `assertOfficialPage(html: string): void`

- [ ] **Step 1: Créer le manifeste minimal et le test d'extraction en échec**

```json
{
  "name": "fcl-billetterie-alertes",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  },
  "engines": {
    "node": ">=22"
  }
}
```

```js
// test/catalogue.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  assertOfficialPage,
  extractSaleUrls,
  labelFromSaleUrl,
} from "../src/catalogue.mjs";

const officialHeading = "<h1>BILLETTERIE OFFICIELLE FC LORIENT</h1>";

test("extractSaleUrls conserve uniquement les ventes de matchs et les déduplique", () => {
  const html = `${officialHeading}
    <a href="/fr/catalogue/match-foot-masculin-fc-lorient-paris-fc">Réserver</a>
    <a href="https://billetterie.fclorient.bzh/fr/catalogue/match-foot-masculin-rc-lens-fc-lorient">Réserver</a>
    <a href="/fr/catalogue/match-foot-masculin-fc-lorient-paris-fc">Doublon</a>
    <a href="/fr/packs">Pack</a>`;

  assert.deepEqual(extractSaleUrls(html), [
    "https://billetterie.fclorient.bzh/fr/catalogue/match-foot-masculin-fc-lorient-paris-fc",
    "https://billetterie.fclorient.bzh/fr/catalogue/match-foot-masculin-rc-lens-fc-lorient",
  ]);
});

test("assertOfficialPage refuse une page étrangère ou dégradée", () => {
  assert.throws(() => assertOfficialPage("<html>maintenance</html>"), /signature officielle absente/);
});

test("labelFromSaleUrl produit un libellé lisible", () => {
  assert.equal(
    labelFromSaleUrl("https://billetterie.fclorient.bzh/fr/catalogue/match-foot-masculin-fc-lorient-paris-fc-1"),
    "FC Lorient – Paris FC",
  );
});
```

- [ ] **Step 2: Exécuter le test et confirmer l'échec attendu**

Run: `npm test -- test/catalogue.test.mjs`

Expected: FAIL avec `ERR_MODULE_NOT_FOUND` pour `src/catalogue.mjs`.

- [ ] **Step 3: Implémenter l'extracteur minimal**

```js
// src/catalogue.mjs
const DEFAULT_BASE_URL = "https://billetterie.fclorient.bzh";
const OFFICIAL_SIGNATURE = "BILLETTERIE OFFICIELLE FC LORIENT";
const MATCH_PATH = /\/fr\/catalogue\/match-foot-masculin-[^\"'?#<\s]+/giu;

export function assertOfficialPage(html) {
  if (!html.includes(OFFICIAL_SIGNATURE)) {
    throw new Error("Page billetterie invalide : signature officielle absente");
  }
}

export function extractSaleUrls(html, baseUrl = DEFAULT_BASE_URL) {
  assertOfficialPage(html);
  const matches = html.match(MATCH_PATH) ?? [];
  return [...new Set(matches.map((path) => new URL(path, baseUrl).href))].sort();
}

export function labelFromSaleUrl(url) {
  const slug = new URL(url).pathname.split("/").filter(Boolean).at(-1)
    .replace(/^match-foot-masculin-/, "")
    .replace(/-\d+$/, "");
  const words = slug.split("-");
  const acronyms = new Set(["ac", "aj", "as", "estac", "fc", "losc", "ogc", "rc", "sco"]);
  const formatTeam = (tokens) => tokens
    .map((word) => acronyms.has(word) ? word.toUpperCase() : `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(" ");
  const lorientIndex = words.findIndex((word, index) => word === "fc" && words[index + 1] === "lorient");
  if (lorientIndex < 0) throw new Error("Lien de match FCL invalide");
  const splitIndex = lorientIndex === 0 ? 2 : lorientIndex;
  return `${formatTeam(words.slice(0, splitIndex))} – ${formatTeam(words.slice(splitIndex))}`;
}
```

- [ ] **Step 4: Exécuter les tests et confirmer le passage**

Run: `npm test -- test/catalogue.test.mjs`

Expected: 3 tests PASS, aucune alerte ni avertissement.

- [ ] **Step 5: Commit**

```bash
git add package.json src/catalogue.mjs test/catalogue.test.mjs
git commit -m "feat: extract FCL match sale links"
```

---

### Task 2: Moteur d'état sans doublon

**Files:**
- Create: `src/state.mjs`
- Create: `test/state.test.mjs`

**Interfaces:**
- Produces: `emptyState(): MonitorState`
- Produces: `processDetectedSales({ urls, state, notify, now }): Promise<{ state, initialized, notified, failures }>`
- `MonitorState` JSON shape: `{ version: 1, initializedAt: string|null, updatedAt: string|null, seen: string[] }`

- [ ] **Step 1: Écrire les tests d'initialisation et de nouvelle vente**

```js
// test/state.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, processDetectedSales } from "../src/state.mjs";

const first = "https://billetterie.fclorient.bzh/fr/catalogue/match-foot-masculin-fc-lorient-paris-fc";
const second = "https://billetterie.fclorient.bzh/fr/catalogue/match-foot-masculin-rc-lens-fc-lorient";
const now = () => "2026-08-29T20:00:00.000Z";

test("le premier contrôle initialise sans notifier", async () => {
  const calls = [];
  const result = await processDetectedSales({ urls: [first], state: emptyState(), notify: async (url) => calls.push(url), now });
  assert.equal(result.initialized, true);
  assert.deepEqual(result.notified, []);
  assert.deepEqual(calls, []);
  assert.deepEqual(result.state.seen, [first]);
});

test("une vente nouvelle est notifiée une seule fois", async () => {
  const baseline = (await processDetectedSales({ urls: [first], state: emptyState(), notify: async () => {}, now })).state;
  const calls = [];
  const opened = await processDetectedSales({ urls: [first, second], state: baseline, notify: async (url) => calls.push(url), now });
  const repeated = await processDetectedSales({ urls: [first, second], state: opened.state, notify: async (url) => calls.push(url), now });
  assert.deepEqual(opened.notified, [second]);
  assert.deepEqual(repeated.notified, []);
  assert.deepEqual(calls, [second]);
});

test("un échec ntfy laisse la vente à retenter", async () => {
  const baseline = (await processDetectedSales({ urls: [first], state: emptyState(), notify: async () => {}, now })).state;
  const result = await processDetectedSales({ urls: [first, second], state: baseline, notify: async () => { throw new Error("ntfy indisponible"); }, now });
  assert.equal(result.failures.length, 1);
  assert.equal(result.state.seen.includes(second), false);
});
```

- [ ] **Step 2: Exécuter le test et confirmer l'échec attendu**

Run: `npm test -- test/state.test.mjs`

Expected: FAIL avec `ERR_MODULE_NOT_FOUND` pour `src/state.mjs`.

- [ ] **Step 3: Implémenter le moteur minimal**

```js
// src/state.mjs
export function emptyState() {
  return { version: 1, initializedAt: null, updatedAt: null, seen: [] };
}

export async function processDetectedSales({ urls, state, notify, now = () => new Date().toISOString() }) {
  const normalized = [...new Set(urls)].sort();
  if (!state.initializedAt) {
    const timestamp = now();
    return {
      state: { version: 1, initializedAt: timestamp, updatedAt: timestamp, seen: normalized },
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
      failures.push({ url, message: error instanceof Error ? error.message : String(error) });
    }
  }

  const changed = notified.length > 0;
  return {
    state: changed ? { ...state, updatedAt: now(), seen: [...seen].sort() } : state,
    initialized: false,
    notified,
    failures,
  };
}
```

- [ ] **Step 4: Exécuter les tests d'état puis toute la suite**

Run: `npm test -- test/state.test.mjs && npm test`

Expected: tous les tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state.mjs test/state.test.mjs
git commit -m "feat: persist notified ticket sales"
```

---

### Task 3: Réseau, CLI et protection du secret

**Files:**
- Create: `src/network.mjs`
- Create: `scripts/run-monitor.mjs`
- Create: `test/network.test.mjs`
- Create: `test/cli.test.mjs`

**Interfaces:**
- Produces: `fetchOfficialSales({ fetchImpl, timeoutMs }): Promise<string[]>`
- Produces: `sendNtfy({ fetchImpl, topic, title, message, clickUrl }): Promise<void>`
- CLI: `node scripts/run-monitor.mjs check --state <path>`
- CLI: `node scripts/run-monitor.mjs inspect`
- CLI: `node scripts/run-monitor.mjs test-notification`

- [ ] **Step 1: Écrire les tests réseau en échec**

```js
// test/network.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { fetchOfficialSales, sendNtfy } from "../src/network.mjs";

test("fetchOfficialSales refuse une réponse HTTP en erreur", async () => {
  await assert.rejects(
    fetchOfficialSales({ fetchImpl: async () => new Response("panne", { status: 503 }), timeoutMs: 100 }),
    /HTTP 503/,
  );
});

test("sendNtfy envoie une priorité haute et le lien sans exposer le sujet dans l'erreur", async () => {
  const secret = "topic-super-secret";
  let request;
  await sendNtfy({
    topic: secret,
    title: "Billetterie FC Lorient ouverte",
    message: "FC Lorient – Paris FC est maintenant en vente.",
    clickUrl: "https://billetterie.fclorient.bzh/fr/catalogue/match-foot-masculin-fc-lorient-paris-fc",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response("ok", { status: 200 });
    },
  });
  assert.equal(request.options.headers.Priority, "high");
  assert.match(request.options.headers.Click, /billetterie\.fclorient\.bzh/);

  await assert.rejects(
    sendNtfy({
      topic: secret,
      title: "Test",
      message: "Test",
      clickUrl: request.options.headers.Click,
      fetchImpl: async () => new Response("non", { status: 500 }),
    }),
    (error) => !error.message.includes(secret) && /HTTP 500/.test(error.message),
  );
});
```

- [ ] **Step 2: Exécuter les tests et confirmer l'échec attendu**

Run: `npm test -- test/network.test.mjs`

Expected: FAIL avec `ERR_MODULE_NOT_FOUND` pour `src/network.mjs`.

- [ ] **Step 3: Implémenter le réseau puis le CLI**

```js
// src/network.mjs
import { extractSaleUrls } from "./catalogue.mjs";

export const TICKET_LIST_URL = "https://billetterie.fclorient.bzh/fr/matchs/billets-packs";

export async function fetchOfficialSales({ fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  const response = await fetchImpl(TICKET_LIST_URL, {
    headers: { "User-Agent": "fcl-billetterie-alertes/1.0 (+https://github.com/simsam56/fcl-billetterie-alertes)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Billetterie indisponible (HTTP ${response.status})`);
  return extractSaleUrls(await response.text());
}

export async function sendNtfy({ fetchImpl = fetch, topic, title, message, clickUrl }) {
  if (!/^[-_A-Za-z0-9]{8,64}$/.test(topic ?? "")) throw new Error("Sujet ntfy absent ou invalide");
  const response = await fetchImpl(`https://ntfy.sh/${topic}`, {
    method: "POST",
    headers: { Title: title, Priority: "high", Tags: "ticket,soccer", Click: clickUrl },
    body: message,
  });
  if (!response.ok) throw new Error(`Notification ntfy refusée (HTTP ${response.status})`);
}
```

```js
// scripts/run-monitor.mjs
import { readFile, writeFile } from "node:fs/promises";
import { extractSaleUrls, labelFromSaleUrl } from "../src/catalogue.mjs";
import { fetchOfficialSales, sendNtfy, TICKET_LIST_URL } from "../src/network.mjs";
import { emptyState, processDetectedSales } from "../src/state.mjs";

const [mode = "check", ...args] = process.argv.slice(2);
const stateFlag = args.indexOf("--state");
const statePath = stateFlag >= 0 ? args[stateFlag + 1] : undefined;
const loadUrls = async () => process.env.FCL_FIXTURE_PATH
  ? extractSaleUrls(await readFile(process.env.FCL_FIXTURE_PATH, "utf8"))
  : fetchOfficialSales();

if (mode === "inspect") {
  const urls = await loadUrls();
  console.log(`${urls.length} vente(s) détectée(s)`);
  for (const url of urls) console.log(url);
} else if (mode === "test-notification") {
  await sendNtfy({
    topic: process.env.NTFY_TOPIC,
    title: "Alerte billetterie FC Lorient",
    message: "Surveillance FC Lorient opérationnelle",
    clickUrl: TICKET_LIST_URL,
  });
  console.log("Notification de contrôle envoyée");
} else if (mode === "check") {
  if (!statePath) throw new Error("Option --state obligatoire en mode check");
  let state = emptyState();
  try { state = JSON.parse(await readFile(statePath, "utf8")); } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const urls = await loadUrls();
  const result = await processDetectedSales({
    urls,
    state,
    notify: async (url) => sendNtfy({
      topic: process.env.NTFY_TOPIC,
      title: "Billetterie FC Lorient ouverte",
      message: `${labelFromSaleUrl(url)} est maintenant en vente.`,
      clickUrl: url,
    }),
  });
  const before = `${JSON.stringify(state, null, 2)}\n`;
  const after = `${JSON.stringify(result.state, null, 2)}\n`;
  if (after !== before) await writeFile(statePath, after, "utf8");
  console.log(result.initialized ? `Référence initialisée avec ${urls.length} vente(s)` : `${result.notified.length} nouvelle(s) vente(s) notifiée(s)`);
  if (result.failures.length) {
    for (const failure of result.failures) console.error(`Échec de notification pour ${failure.url}: ${failure.message}`);
    process.exitCode = 1;
  }
} else {
  throw new Error(`Mode inconnu: ${mode}`);
}
```

- [ ] **Step 4: Ajouter un test CLI sur un fichier temporaire**

```js
// test/cli.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("le CLI initialise une fois sans afficher le sujet ntfy", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fcl-monitor-"));
  const fixture = join(directory, "page.html");
  const statePath = join(directory, "seen.json");
  const secret = "topic-super-secret-for-test";
  await writeFile(fixture, `<h1>BILLETTERIE OFFICIELLE FC LORIENT</h1>
    <a href="/fr/catalogue/match-foot-masculin-fc-lorient-paris-fc">Réserver</a>`);

  const run = () => new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/run-monitor.mjs", "check", "--state", statePath], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, FCL_FIXTURE_PATH: fixture, NTFY_TOPIC: secret },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });

  try {
    const first = await run();
    const initialState = await readFile(statePath, "utf8");
    const second = await run();
    assert.equal(first.code, 0);
    assert.equal(second.code, 0);
    assert.equal(await readFile(statePath, "utf8"), initialState);
    assert.doesNotMatch(`${first.stdout}${first.stderr}${second.stdout}${second.stderr}`, new RegExp(secret));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
```

- [ ] **Step 5: Exécuter les tests réseau, CLI et globaux**

Run: `npm test -- test/network.test.mjs test/cli.test.mjs && npm test`

Expected: tous les tests PASS et aucun secret imprimé.

- [ ] **Step 6: Commit**

```bash
git add src/network.mjs scripts/run-monitor.mjs test/network.test.mjs test/cli.test.mjs
git commit -m "feat: check sales and notify ntfy"
```

---

### Task 4: Workflow GitHub et documentation d'exploitation

**Files:**
- Create: `.github/workflows/monitor.yml`
- Create: `test/workflow.test.mjs`
- Create: `README.md`
- Create: `.gitignore`

**Interfaces:**
- Consumes: `scripts/run-monitor.mjs`
- Produces: workflow `monitor` avec `schedule` et `workflow_dispatch`
- Produces: secret requis `NTFY_TOPIC`
- Produces: branche persistante `state` et fichier `seen.json`

- [ ] **Step 1: Écrire le test statique du workflow en échec**

```js
// test/workflow.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("le workflow est planifié, sérialisé et limite ses permissions", async () => {
  const yaml = await readFile(new URL("../.github/workflows/monitor.yml", import.meta.url), "utf8");
  assert.match(yaml, /cron: ['\"]\*\/5 \* \* \* \*['\"]/);
  assert.match(yaml, /workflow_dispatch:/);
  assert.match(yaml, /contents: write/);
  assert.match(yaml, /cancel-in-progress: false/);
  assert.match(yaml, /always\(\).*env\.MODE == 'check'/);
  assert.match(yaml, /NTFY_TOPIC: \$\{\{ secrets\.NTFY_TOPIC \}\}/);
  assert.match(yaml, /ref: state/);
  assert.doesNotMatch(yaml, /fcl-billets-[a-f0-9]{20,}/);
});
```

- [ ] **Step 2: Exécuter le test et confirmer l'échec attendu**

Run: `npm test -- test/workflow.test.mjs`

Expected: FAIL avec `ENOENT` pour `.github/workflows/monitor.yml`.

- [ ] **Step 3: Créer le workflow minimal**

```yaml
# .github/workflows/monitor.yml
name: monitor

on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch:
    inputs:
      mode:
        description: Mode à exécuter
        required: true
        default: check
        type: choice
        options: [check, inspect, test-notification]
permissions:
  contents: write
concurrency:
  group: fcl-ticket-monitor
  cancel-in-progress: false

jobs:
  monitor:
    runs-on: ubuntu-latest
    env:
      MODE: ${{ github.event_name == 'workflow_dispatch' && inputs.mode || 'check' }}
      NTFY_TOPIC: ${{ secrets.NTFY_TOPIC }}
    steps:
      - name: Checkout application
        uses: actions/checkout@v4
      - name: Checkout state
        uses: actions/checkout@v4
        with:
          ref: state
          path: .monitor-state
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Run tests
        run: npm test
      - name: Run monitor
        run: |
          if [ "$MODE" = "check" ]; then
            node scripts/run-monitor.mjs check --state .monitor-state/seen.json
          else
            node scripts/run-monitor.mjs "$MODE"
          fi
      - name: Persist state
        if: always() && env.MODE == 'check'
        run: |
          git -C .monitor-state config user.name "github-actions[bot]"
          git -C .monitor-state config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git -C .monitor-state add seen.json
          if ! git -C .monitor-state diff --cached --quiet; then
            git -C .monitor-state commit -m "chore: update ticket monitor state"
            git -C .monitor-state push origin state
          fi
```

- [ ] **Step 4: Documenter les opérations exactes**

Le README explique : architecture, délai attendu, limite GitHub, lancement manuel, consultation des exécutions, remplacement du secret via `gh secret set NTFY_TOPIC`, réinitialisation annuelle volontaire de `seen.json`, et rappel que le système n'achète aucun billet. `.gitignore` exclut `.monitor-state/`, `node_modules/`, `.env` et les fichiers temporaires.

- [ ] **Step 5: Exécuter tous les tests et vérifier le diff**

Run: `npm test && git diff --check`

Expected: tous les tests PASS ; aucun problème d'espace ou secret détecté.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/monitor.yml test/workflow.test.mjs README.md .gitignore
git commit -m "ci: schedule FCL ticket monitoring"
```

---

### Task 5: Publication, référence initiale et vérification réelle

**Files:**
- Modify: `.agent/SHARED.md`
- External: dépôt public `https://github.com/simsam56/fcl-billetterie-alertes`
- External secret: `NTFY_TOPIC`
- External branch: `state`

**Interfaces:**
- Consumes: tous les fichiers et commandes des tâches précédentes
- Produces: surveillance GitHub Actions active et notification ntfy de contrôle reçue

- [ ] **Step 1: Vérifier localement avant publication**

Run: `npm test && node scripts/run-monitor.mjs inspect && git status --short`

Expected: tests PASS ; au moins une vente réelle listée le 29 août 2026 ; worktree propre hors mise à jour partagée prévue.

- [ ] **Step 2: Créer et pousser le dépôt public explicitement autorisé**

```bash
gh repo create simsam56/fcl-billetterie-alertes --public --source=. --remote=origin --push
```

Expected: URL du dépôt retournée et branche `main` visible.

- [ ] **Step 3: Créer la branche d'état sans exposer le secret**

Créer `state` depuis `main` via l'API GitHub :

```bash
fcl_main_sha="$(gh api repos/simsam56/fcl-billetterie-alertes/git/ref/heads/main --jq .object.sha)"
gh api --method POST repos/simsam56/fcl-billetterie-alertes/git/refs \
  -f ref='refs/heads/state' \
  -f sha="$fcl_main_sha"
```

Puis encoder le contenu suivant en base64 :

```json
{
  "version": 1,
  "initializedAt": null,
  "updatedAt": null,
  "seen": []
}
```

```bash
fcl_state_content="$(printf '%s\n' '{"version":1,"initializedAt":null,"updatedAt":null,"seen":[]}' | base64 | tr -d '\n')"
gh api --method PUT repos/simsam56/fcl-billetterie-alertes/contents/seen.json \
  -f message='chore: initialize monitor state' \
  -f branch=state \
  -f content="$fcl_state_content"
```

Vérifier par `gh api repos/simsam56/fcl-billetterie-alertes/contents/seen.json?ref=state --jq .content | base64 --decode` que le JSON est non initialisé.

- [ ] **Step 4: Enregistrer le secret ntfy puis vérifier qu'il n'est pas lisible**

Run: `gh secret set NTFY_TOPIC --repo simsam56/fcl-billetterie-alertes`

Passer la valeur via stdin, jamais comme argument de commande. Puis lancer `gh secret list --repo simsam56/fcl-billetterie-alertes` et vérifier uniquement la présence du nom `NTFY_TOPIC`.

- [ ] **Step 5: Lancer la référence initiale et vérifier l'état**

Run: `gh workflow run monitor.yml -f mode=check --repo simsam56/fcl-billetterie-alertes`

Suivre l'exécution avec `gh run watch`, exiger un succès, puis lire `seen.json` sur la branche `state`. Vérifier `initializedAt` non nul et l'absence de notification de nouveau match sur ce contrôle initial.

- [ ] **Step 6: Vérifier GitHub Actions vers ntfy**

Run: `gh workflow run monitor.yml -f mode=test-notification --repo simsam56/fcl-billetterie-alertes`

Suivre l'exécution jusqu'au succès. Demander à Simon de confirmer la réception de `Surveillance FC Lorient opérationnelle`. Le clic doit ouvrir la page officielle des billets.

- [ ] **Step 7: Contrôler un deuxième passage sans doublon**

Relancer `mode=check`, exiger un succès, puis confirmer que `seen.json` n'a pas gagné de doublon et qu'aucune nouvelle notification de match n'a été envoyée.

- [ ] **Step 8: Clôturer le canal partagé et commit final si nécessaire**

Retirer la ligne Codex de `## En cours`, ajouter sous `## Etat` une ligne datée indiquant l'URL du dépôt, le statut du workflow, le nombre de ventes de référence et le résultat du test ntfy, puis commit/push cette mise à jour.

Run final: `npm test && git status --short && gh run list --workflow monitor.yml --limit 3 --repo simsam56/fcl-billetterie-alertes`

Expected: tests PASS, worktree propre, derniers contrôles GitHub au vert.
