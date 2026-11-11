import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SECTIONS } from "../scripts/classify.mjs";
import { columnsOf, diceForTable, tableNumber } from "../scripts/tables.mjs";
import { buildTableSpecs, hashText } from "../scripts/roll-tables-plan.mjs";
import { buildManualEvent, pickColumn } from "../scripts/manual-event.mjs";

const FILES = { miss: "miss", hitGM: "hit-gm", hitPC: "hit-pc", fumble: "fumble", luck: "luck" };
const datasets = Object.fromEntries(Object.entries(FILES).map(([section, file]) =>
  [section, JSON.parse(readFileSync(new URL(`../data/${file}.ru.json`, import.meta.url), "utf8"))]));

const names = {
  section: section => `S:${section}`,
  column: (section, column) => `C:${column}`,
  result: (n, tier) => `№${n}${tier ? ` ${tier}` : ""}`
};

test("номер таблицы и обратное преобразование кубиков совпадают для всех 60 таблиц", () => {
  for ( let table = 1; table <= 60; table++ ) {
    const { d10, d6 } = diceForTable(table);
    assert.ok(d10 >= 1 && d10 <= 10 && d6 >= 1 && d6 <= 6, `таблица ${table}`);
    assert.equal(tableNumber(d10, d6), table);
  }
});

test("колонки разделов совпадают с ключами в данных", () => {
  for ( const section of [SECTIONS.MISS, SECTIONS.HIT_GM, SECTIONS.HIT_PC] ) {
    const keys = Object.keys(datasets[section].entries[0].columns);
    assert.deepEqual([...columnsOf(section)].sort(), [...keys].sort(), section);
  }
  assert.deepEqual(columnsOf(SECTIONS.FUMBLE), []);
});

test("таблицы боковой панели: 14 таблиц по 60 результатов, диапазоны 1–60 без пропусков", () => {
  const specs = buildTableSpecs(datasets, names);
  assert.equal(specs.length, 14);
  assert.equal(new Set(specs.map(spec => spec.key)).size, 14);
  for ( const spec of specs ) {
    assert.equal(spec.results.length, 60, spec.key);
    spec.results.forEach((result, i) => {
      assert.deepEqual(result.range, [i + 1, i + 1], spec.key);
      assert.ok(result.description.startsWith("<p>"), `${spec.key} ${i + 1}`);
    });
  }
  const luck = specs.find(spec => spec.key === "luck");
  assert.match(luck.results[0].description, /<strong>1\.<\/strong>/);
  assert.match(luck.results[0].description, /<strong>2\.<\/strong>/);
});

test("таблицы: хеш меняется вместе с содержимым", () => {
  const first = buildTableSpecs(datasets, names)[0];
  const again = buildTableSpecs(datasets, names)[0];
  assert.equal(first.hash, again.hash);
  assert.notEqual(hashText("a"), hashText("b"));
  const changed = structuredClone(datasets);
  changed.miss.entries[0].columns.melee += " ";
  assert.notEqual(buildTableSpecs(changed, names)[0].hash, first.hash);
});

test("ручное событие: значение кубика, колонка и сторона по разделу", () => {
  const user = { id: "u1", name: "ГМ", isGM: true };
  const hero = { uuid: "Actor.a", name: "Герой", type: "character" };

  const miss = buildManualEvent({ section: SECTIONS.MISS, column: "ranged", user, actor: hero });
  assert.equal(miss.natural, 1);
  assert.equal(miss.attackKind, "ranged");
  assert.equal(miss.damageColumn, null);
  assert.equal(miss.side, "player");
  assert.equal(miss.rollType, "manual");

  const hit = buildManualEvent({ section: SECTIONS.HIT_GM, column: "bogus", user, actor: hero });
  assert.equal(hit.natural, 20);
  assert.equal(hit.damageColumn, "slashing");
  assert.equal(hit.attackKind, null);

  const luck = buildManualEvent({ section: SECTIONS.LUCK, column: "melee", user, actor: hero });
  assert.equal(luck.attackKind, null);
  assert.equal(luck.damageColumn, null);

  const monster = buildManualEvent({
    section: SECTIONS.MISS, column: "melee", user,
    actor: { uuid: "Actor.m", name: "Огр", type: "npc", disposition: -1 },
    targets: [{ name: "Герой", uuid: "Actor.a" }]
  });
  assert.equal(monster.side, "enemy");
  assert.deepEqual(monster.targets, ["Герой"]);
  assert.deepEqual(monster.targetUuids, ["Actor.a"]);

  assert.equal(buildManualEvent({ section: "nope", user }), null);
  assert.equal(pickColumn(SECTIONS.FUMBLE, "melee"), null);
});
