import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { diceForTable } from "../scripts/tables.mjs";

const SECTION_FILES = { miss: "miss", hitGM: "hit-gm", hitPC: "hit-pc", fumble: "fumble", luck: "luck" };
const VARIANT_FILES = ["fumble", "luck"];
const load = (name, lang) => JSON.parse(readFileSync(new URL(`../data/${name}.${lang}.json`, import.meta.url), "utf8"));

/** Все строковые значения файла (рекурсивно), включая заголовок и источник. */
function strings(value, out = []) {
  if ( typeof value === "string" ) out.push(value);
  else if ( value && (typeof value === "object") ) Object.values(value).forEach(item => strings(item, out));
  return out;
}

for ( const [section, name] of Object.entries(SECTION_FILES) ) {
  const ru = load(name, "ru");
  const en = load(name, "en");

  test(`${name}.en.json: раздел ${section} совпадает с ru по структуре: 60 записей, таблицы и кубики`, () => {
    assert.equal(en.section, ru.section);
    assert.equal(en.entries.length, 60);
    en.entries.forEach((entry, i) => {
      const table = i + 1;
      assert.equal(entry.table, table, `порядок таблиц, запись ${table}`);
      assert.deepEqual({ d10: entry.d10, d6: entry.d6 }, diceForTable(table), `кубики, таблица ${table}`);
      assert.deepEqual({ d10: entry.d10, d6: entry.d6 }, { d10: ru.entries[i].d10, d6: ru.entries[i].d6 }, `таблица ${table}`);
    });
  });

  test(`${name}.en.json: те же колонки и варианты, что в ru, у каждой записи`, () => {
    en.entries.forEach((entry, i) => {
      const ruEntry = ru.entries[i];
      assert.deepEqual(Object.keys(entry).sort(), Object.keys(ruEntry).sort(), `ключи записи ${entry.table}`);
      if ( ruEntry.columns ) {
        assert.deepEqual(Object.keys(entry.columns), Object.keys(ruEntry.columns), `колонки записи ${entry.table}`);
        for ( const column of Object.keys(ruEntry.columns) ) {
          assert.ok(entry.columns[column], `текст ${column}, таблица ${entry.table}`);
        }
      }
      if ( ruEntry.variants ) {
        assert.equal(entry.variants.length, ruEntry.variants.length, `варианты, таблица ${entry.table}`);
      }
    });
  });

  test(`${name}.en.json: разметка auto и fx побайтно совпадает с ru`, () => {
    en.entries.forEach((entry, i) => {
      const ruEntry = ru.entries[i];
      for ( const key of ["auto", "fx"] ) {
        assert.equal(JSON.stringify(entry[key]), JSON.stringify(ruEntry[key]), `${key}, таблица ${entry.table}`);
      }
    });
  });

  test(`${name}.en.json: уровни риска (tiers) совпадают с ru по границам`, () => {
    assert.deepEqual(en.tiers?.map(({ from, to }) => [from, to]), ru.tiers?.map(({ from, to }) => [from, to]));
  });

  test(`${name}.en.json: в тексте нет кириллицы и символов U+FFFD`, () => {
    const bad = strings(en).filter(text => /\p{Script=Cyrillic}/u.test(text) || text.includes("�"));
    assert.deepEqual(bad, []);
  });

  test(`${name}.en.json: все тексты результатов непустые строки`, () => {
    for ( const entry of en.entries ) {
      const texts = entry.columns ? Object.values(entry.columns) : entry.variants;
      for ( const text of texts ) {
        assert.equal(typeof text, "string", `таблица ${entry.table}`);
        assert.ok(text.trim().length > 0, `пустой текст, таблица ${entry.table}`);
      }
    }
  });
}

for ( const name of VARIANT_FILES ) {
  test(`${name}.en.json: у каждой записи ровно два варианта текста`, () => {
    for ( const entry of load(name, "en").entries ) {
      assert.equal(entry.variants.length, 2, `таблица ${entry.table}`);
    }
  });
}

test("miss.en.json, hit-gm.en.json, hit-pc.en.json: колонки те же, что в ru (виды атаки и типы урона)", () => {
  for ( const name of ["miss", "hit-gm", "hit-pc"] ) {
    const keys = load(name, "en").entries.map(entry => Object.keys(entry.columns).sort().join(","));
    assert.equal(new Set(keys).size, 1, name);
    assert.equal(keys[0], Object.keys(load(name, "ru").entries[0].columns).sort().join(","), name);
  }
});

test("подписи уровней риска в английском файле", () => {
  const labels = name => load(name, "en").tiers.map(tier => tier.label);
  assert.deepEqual(labels("miss"), ["Awkward", "Embarrassing", "Shameful", "Disgraceful"]);
  assert.deepEqual(labels("hit-gm"), ["Setback", "Dangerous", "Life-Threatening", "Deadly"]);
  assert.deepEqual(labels("hit-pc"), ["Setback", "Dangerous", "Life-Threatening", "Deadly"]);
  assert.equal(load("fumble", "en").tiers, undefined);
  assert.equal(load("luck", "en").tiers, undefined);
});
