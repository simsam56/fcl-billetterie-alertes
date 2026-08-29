import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchOfficialSales,
  sendNtfy,
} from "../src/network.mjs";

test("fetchOfficialSales extrait une vente depuis la page officielle", async () => {
  const html = `<h1>BILLETTERIE OFFICIELLE FC LORIENT</h1>
    <a href="/fr/catalogue/match-foot-masculin-fc-lorient-paris-fc">Réserver</a>`;
  const result = await fetchOfficialSales({
    fetchImpl: async () => new Response(html, { status: 200 }),
    timeoutMs: 100,
  });

  assert.deepEqual(result, [
    "https://billetterie.fclorient.bzh/fr/catalogue/match-foot-masculin-fc-lorient-paris-fc",
  ]);
});

test("fetchOfficialSales refuse une réponse HTTP en erreur", async () => {
  await assert.rejects(
    fetchOfficialSales({
      fetchImpl: async () => new Response("panne", { status: 503 }),
      timeoutMs: 100,
    }),
    /HTTP 503/,
  );
});

test("sendNtfy envoie une priorité haute et le lien sans exposer le sujet", async () => {
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
    (error) =>
      !error.message.includes(secret) && /HTTP 500/.test(error.message),
  );
});

test("sendNtfy refuse un sujet absent avant tout appel réseau", async () => {
  let called = false;
  await assert.rejects(
    sendNtfy({
      topic: "",
      title: "Test",
      message: "Test",
      clickUrl: "https://billetterie.fclorient.bzh/fr/",
      fetchImpl: async () => {
        called = true;
        return new Response("ok");
      },
    }),
    /absent ou invalide/,
  );
  assert.equal(called, false);
});

test("sendNtfy interrompt un appel réseau trop long", async () => {
  await assert.rejects(
    sendNtfy({
      topic: "topic-valide",
      title: "Test",
      message: "Test",
      clickUrl: "https://billetterie.fclorient.bzh/fr/",
      timeoutMs: 5,
      fetchImpl: async (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          const guard = setTimeout(
            () => reject(new Error("Le signal de timeout n'a pas été émis")),
            100,
          );
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(guard);
              reject(signal.reason);
            },
            { once: true },
          );
        }),
    }),
    /timed out|timeout/i,
  );
});
