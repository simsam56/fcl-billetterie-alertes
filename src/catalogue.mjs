const DEFAULT_BASE_URL = "https://billetterie.fclorient.bzh";
const OFFICIAL_SIGNATURES = [
  "BILLETTERIE OFFICIELLE FC LORIENT",
  "<title>Billets & Packs | FC Lorient</title>",
];
const MATCH_PATH = /\/fr\/catalogue\/match-foot-masculin-[^"'?#<\s]+/giu;
const ACRONYMS = new Set([
  "ac",
  "aj",
  "as",
  "estac",
  "fc",
  "losc",
  "ogc",
  "rc",
  "sco",
]);

export function assertOfficialPage(html) {
  if (!OFFICIAL_SIGNATURES.some((signature) => html.includes(signature))) {
    throw new Error("Page billetterie invalide : signature officielle absente");
  }
}

export function extractSaleUrls(html, baseUrl = DEFAULT_BASE_URL) {
  assertOfficialPage(html);
  const matches = html.match(MATCH_PATH) ?? [];
  return [...new Set(matches.map((path) => new URL(path, baseUrl).href))].sort();
}

function formatTeam(tokens) {
  return tokens
    .map((word) =>
      ACRONYMS.has(word)
        ? word.toUpperCase()
        : `${word[0].toUpperCase()}${word.slice(1)}`,
    )
    .join(" ");
}

export function labelFromSaleUrl(url) {
  const slug = new URL(url).pathname
    .split("/")
    .filter(Boolean)
    .at(-1)
    .replace(/^match-foot-masculin-/, "")
    .replace(/-\d+$/, "");
  const words = slug.split("-");
  const lorientIndex = words.findIndex(
    (word, index) => word === "fc" && words[index + 1] === "lorient",
  );
  if (lorientIndex < 0) {
    throw new Error("Lien de match FCL invalide");
  }
  const splitIndex = lorientIndex === 0 ? 2 : lorientIndex;
  return `${formatTeam(words.slice(0, splitIndex))} – ${formatTeam(words.slice(splitIndex))}`;
}
