import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SECTIONS } from "../scripts/classify.mjs";
import {
  ceilingTable, columnFor, isColumnSection, isVariantSection, levelTierIndex, tableNumber, tierOf
} from "../scripts/tables.mjs";

const load = name => JSON.parse(readFileSync(new URL(`../data/${name}.ru.json`, import.meta.url), "utf8"));

test("tableNumber: границы и порядок", () => {
  assert.equal(tableNumber(1, 1), 1);
  assert.equal(tableNumber(1, 6), 6);
  assert.equal(tableNumber(2, 1), 7);
  assert.equal(tableNumber(10, 6), 60);
});

for ( const name of ["fumble", "luck"] ) {
  test(`данные ${name}: 60 записей, номера и варианты сходятся`, () => {
    const { entries } = load(name);
    assert.equal(entries.length, 60);
    entries.forEach((entry, i) => {
      assert.equal(entry.table, i + 1);
      assert.equal(tableNumber(entry.d10, entry.d6), entry.table);
      assert.ok(entry.variants.length >= 1 && entry.variants.length <= 2, `таблица ${entry.table}`);
      assert.ok(entry.variants.every(v => typeof v === "string" && v.trim().length > 0), `таблица ${entry.table}`);
    });
  });
}

const COLUMNS = {
  miss: ["melee", "ranged", "natural", "magic"],
  "hit-gm": ["slashing", "piercing", "bludgeoning", "magical"],
  "hit-pc": ["slashing", "piercing", "bludgeoning", "magical"]
};

for ( const [name, columns] of Object.entries(COLUMNS) ) {
  test(`данные ${name}: 60 таблиц, 4 колонки, уровни риска без пропусков`, () => {
    const { entries, tiers } = load(name);
    assert.equal(entries.length, 60);
    entries.forEach((entry, i) => {
      assert.equal(entry.table, i + 1);
      assert.equal(tableNumber(entry.d10, entry.d6), entry.table);
      assert.deepEqual(Object.keys(entry.columns).sort(), [...columns].sort(), `таблица ${entry.table}`);
      for ( const column of columns ) {
        const text = entry.columns[column];
        assert.ok(text.trim().length >= 5, `таблица ${entry.table}/${column}`);
        assert.ok(!text.includes("[?]"), `таблица ${entry.table}/${column}`);
        assert.ok(!/\s{2,}/.test(text), `таблица ${entry.table}/${column}: двойной пробел`);
      }
    });
    assert.equal(tiers.length, 4);
    assert.equal(tiers[0].from, 1);
    assert.equal(tiers.at(-1).to, 60);
    tiers.forEach((tier, i) => {
      assert.ok(tier.from <= tier.to);
      if ( i ) assert.equal(tier.from, tiers[i - 1].to + 1);
    });
  });
}

test("уровни риска: границы из индексных страниц PDF", () => {
  const bounds = name => load(name).tiers.map(t => [t.from, t.to]);
  assert.deepEqual(bounds("miss"), [[1, 26], [27, 44], [45, 54], [55, 60]]);
  assert.deepEqual(bounds("hit-gm"), [[1, 18], [19, 36], [37, 55], [56, 60]]);
  assert.deepEqual(bounds("hit-pc"), [[1, 28], [29, 45], [46, 54], [55, 60]]);
});

test("levelTierIndex: уровни 1, 5, 9 и 13 открывают очередной уровень риска", () => {
  const index = level => levelTierIndex(level);
  assert.deepEqual([1, 4, 5, 8, 9, 12, 13, 20].map(index), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.equal(levelTierIndex(null), null);
  assert.equal(levelTierIndex(undefined), null);
});

test("ceilingTable и tierOf", () => {
  const { tiers } = load("hit-pc");
  assert.equal(ceilingTable(tiers, 1), 28);
  assert.equal(ceilingTable(tiers, 5), 45);
  assert.equal(ceilingTable(tiers, 9), 54);
  assert.equal(ceilingTable(tiers, 13), 60);
  assert.equal(ceilingTable(tiers, null), 60);
  assert.equal(ceilingTable(undefined, 1), 60);
  assert.equal(tierOf(tiers, 28).label, "Неудача");
  assert.equal(tierOf(tiers, 29).label, "Опасность");
  assert.equal(tierOf(tiers, 60).label, "Смертельный исход");
  assert.equal(tierOf(tiers, 61), null);
});

test("columnFor и isColumnSection", () => {
  const event = { attackKind: "natural", damageColumn: "piercing" };
  assert.equal(columnFor(SECTIONS.MISS, event), "natural");
  assert.equal(columnFor(SECTIONS.HIT_GM, event), "piercing");
  assert.equal(columnFor(SECTIONS.HIT_PC, event), "piercing");
  assert.equal(columnFor(SECTIONS.HIT_PC, { damageColumn: null }), null);
  assert.equal(columnFor(SECTIONS.FUMBLE, event), null);
  assert.equal(isColumnSection(SECTIONS.MISS), true);
  assert.equal(isColumnSection(SECTIONS.LUCK), false);
});

test("isVariantSection", () => {
  assert.equal(isVariantSection(SECTIONS.FUMBLE), true);
  assert.equal(isVariantSection(SECTIONS.LUCK), true);
  assert.equal(isVariantSection(SECTIONS.MISS), false);
});
