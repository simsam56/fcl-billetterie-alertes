import { extractSaleUrls } from "./catalogue.mjs";

export const TICKET_LIST_URL =
  "https://billetterie.fclorient.bzh/fr/matchs/billets-packs";

export async function fetchOfficialSales({
  fetchImpl = fetch,
  timeoutMs = 15_000,
} = {}) {
  const response = await fetchImpl(TICKET_LIST_URL, {
    headers: {
      "User-Agent":
        "fcl-billetterie-alertes/1.0 (+https://github.com/simsam56/fcl-billetterie-alertes)",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Billetterie indisponible (HTTP ${response.status})`);
  }
  return extractSaleUrls(await response.text());
}

export async function sendNtfy({
  fetchImpl = fetch,
  topic,
  title,
  message,
  clickUrl,
  timeoutMs = 15_000,
}) {
  if (!/^[-_A-Za-z0-9]{8,64}$/.test(topic ?? "")) {
    throw new Error("Sujet ntfy absent ou invalide");
  }
  const response = await fetchImpl(`https://ntfy.sh/${topic}`, {
    method: "POST",
    headers: {
      Title: title,
      Priority: "high",
      Tags: "ticket,soccer",
      Click: clickUrl,
    },
    body: message,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Notification ntfy refusée (HTTP ${response.status})`);
  }
}
