import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Заглушки Foundry: маршрут файла модуля и загрузка по сети. Файлы читаются с диска из data/.
globalThis.foundry = { utils: { getRoute: path => `/${path}` } };
const requested = [];
let missing = new Set();
globalThis.fetch = async url => {
  requested.push(url);
  const name = url.split("/").pop();
  if ( missing.has(name) ) return { ok: false, status: 404, statusText: "Not Found" };
  const text = readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8");
  return { ok: true, json: async () => JSON.parse(text) };
};

const { loadSection } = await import("../scripts/engine.mjs");

/** Запускает загрузку при заданном языке Foundry; тихие предупреждения и ошибки не засоряют вывод тестов. */
async function loadIn(lang, section) {
  globalThis.game = { i18n: { lang } };
  const { warn, error } = console;
  console.warn = () => {};
  console.error = () => {};
  try {
    return await loadSection(section);
  } finally {
    console.warn = warn;
    console.error = error;
    delete globalThis.game;
  }
}

const requestsFor = name => requested.filter(url => url.endsWith(`/${name}`));

test("при языке en читается файл .en.json, tiers приходят английские", async () => {
  requested.length = 0;
  const data = await loadIn("en", "miss");
  assert.deepEqual(requested, ["/modules/critical-rolls/data/miss.en.json"]);
  assert.equal(data.tiers[0].label, "Awkward");
});

test("при языке en без английского файла раздел читается из ru", async () => {
  requested.length = 0;
  missing = new Set(["hit-gm.en.json"]);
  try {
    const data = await loadIn("en", "hitGM");
    assert.deepEqual(requested, [
      "/modules/critical-rolls/data/hit-gm.en.json",
      "/modules/critical-rolls/data/hit-gm.ru.json"
    ]);
    assert.equal(data.tiers[0].label, "Неудача");
  } finally {
    missing = new Set();
  }
});

test("при языке ru читается только .ru.json, английский файл не запрашивается", async () => {
  requested.length = 0;
  const data = await loadIn("ru", "hitPC");
  assert.deepEqual(requested, ["/modules/critical-rolls/data/hit-pc.ru.json"]);
  assert.equal(data.tiers[0].label, "Неудача");
});

test("кеш ключуется по языку: после en загрузка ru идёт из своего файла, и повторный вызов не запрашивает сеть", async () => {
  requested.length = 0;
  const en = await loadIn("en", "luck");
  const ru = await loadIn("ru", "luck");
  assert.equal(requestsFor("luck.en.json").length, 1);
  assert.equal(requestsFor("luck.ru.json").length, 1);
  assert.notEqual(en, ru);
  assert.equal(ru.entries[0].variants[0], "Вы преуспеваете в броске атаки.");
  assert.equal(en.entries[0].variants[0], "Succeed on an attack roll.");

  await loadIn("en", "luck");
  await loadIn("ru", "luck");
  assert.equal(requested.length, 2, "повторные вызовы берут данные из кеша");
});

test("неизвестный раздел: null и без запросов к сети", async () => {
  requested.length = 0;
  assert.equal(await loadIn("en", "unknown"), null);
  assert.equal(requested.length, 0);
});
