import { readFile, writeFile } from "node:fs/promises";

import {
  extractSaleUrls,
  labelFromSaleUrl,
} from "../src/catalogue.mjs";
import {
  fetchOfficialSales,
  sendNtfy,
  TICKET_LIST_URL,
} from "../src/network.mjs";
import {
  emptyState,
  processDetectedSales,
  validateState,
} from "../src/state.mjs";

const [mode = "check", ...args] = process.argv.slice(2);
const stateFlag = args.indexOf("--state");
const statePath = stateFlag >= 0 ? args[stateFlag + 1] : undefined;

async function loadUrls() {
  if (process.env.FCL_FIXTURE_PATH) {
    const fixture = await readFile(process.env.FCL_FIXTURE_PATH, "utf8");
    return extractSaleUrls(fixture);
  }
  return fetchOfficialSales();
}

if (mode === "inspect") {
  const urls = await loadUrls();
  console.log(`${urls.length} vente(s) détectée(s)`);
  for (const url of urls) {
    console.log(url);
  }
} else if (mode === "test-notification") {
  await sendNtfy({
    topic: process.env.NTFY_TOPIC,
    title: "Alerte billetterie FC Lorient",
    message: "Surveillance FC Lorient opérationnelle",
    clickUrl: TICKET_LIST_URL,
  });
  console.log("Notification de contrôle envoyée");
} else if (mode === "check") {
  if (!statePath) {
    throw new Error("Option --state obligatoire en mode check");
  }

  let state = emptyState();
  try {
    state = JSON.parse(await readFile(statePath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
  validateState(state);

  const urls = await loadUrls();
  const result = await processDetectedSales({
    urls,
    state,
    notify: async (url) =>
      sendNtfy({
        topic: process.env.NTFY_TOPIC,
        title: "Billetterie FC Lorient ouverte",
        message: `${labelFromSaleUrl(url)} est maintenant en vente.`,
        clickUrl: url,
      }),
  });

  const before = `${JSON.stringify(state, null, 2)}\n`;
  const after = `${JSON.stringify(result.state, null, 2)}\n`;
  if (after !== before) {
    await writeFile(statePath, after, "utf8");
  }

  console.log(
    result.initialized
      ? `Référence initialisée avec ${urls.length} vente(s)`
      : `${result.notified.length} nouvelle(s) vente(s) notifiée(s)`,
  );
  if (result.failures.length > 0) {
    for (const failure of result.failures) {
      console.error(
        `Échec de notification pour ${failure.url}: ${failure.message}`,
      );
    }
    process.exitCode = 1;
  }
} else {
  throw new Error(`Mode inconnu: ${mode}`);
}
