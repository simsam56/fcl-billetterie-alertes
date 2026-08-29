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
  assert.throws(
    () => assertOfficialPage("<html>maintenance</html>"),
    /signature officielle absente/,
  );
});

test("labelFromSaleUrl produit un libellé lisible à domicile", () => {
  assert.equal(
    labelFromSaleUrl("https://billetterie.fclorient.bzh/fr/catalogue/match-foot-masculin-fc-lorient-paris-fc-1"),
    "FC Lorient – Paris FC",
  );
});

test("labelFromSaleUrl produit un libellé lisible à l'extérieur", () => {
  assert.equal(
    labelFromSaleUrl("https://billetterie.fclorient.bzh/fr/catalogue/match-foot-masculin-rc-lens-fc-lorient"),
    "RC Lens – FC Lorient",
  );
});
