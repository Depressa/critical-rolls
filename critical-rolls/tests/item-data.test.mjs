import { test } from "node:test";
import assert from "node:assert/strict";
import { buildItemData, excerpt } from "../scripts/item-data.mjs";

const labels = {
  kind: "Удача",
  deferred: "на выбор",
  use: "Использовать",
  variant: n => `Вариант ${n}`
};
const variants = [
  "Вы получаете бонус 1d4 на бросок атаки.",
  "К вам на помощь приходит старый знакомый."
];

test("excerpt", () => {
  assert.equal(excerpt("Коротко."), "Коротко");
  assert.equal(excerpt("Вы получаете бонус 1d4 на бросок атаки и ещё кое-что важное."), "Вы получаете бонус 1d4 на бросок атаки…");
  assert.equal(excerpt("  много   пробелов \n тут  "), "много пробелов тут");
  assert.ok(excerpt("Сверхдлинноеслововбезединогопробеланипочемунехотящеезакончиться").endsWith("…"));
});

test("предмет с выбранным вариантом: одна активность, одно использование, автоудаление", () => {
  const item = buildItemData({ kind: "luck", table: 4, variants, choice: 1, labels });
  assert.equal(item.type, "consumable");
  assert.equal(item.name, "Удача: К вам на помощь приходит старый знакомый");
  assert.equal(item.img, "icons/magic/control/buff-luck-fortune-clover-green.webp");
  assert.ok(item.system.description.chat.length > 0);
  assert.equal(item.system.description.chat, item.system.description.value);
  assert.deepEqual(item.system.uses, { max: "1", spent: 0, recovery: [], autoDestroy: true });
  assert.equal(item.system.quantity, 1);

  const activities = Object.values(item.system.activities);
  assert.equal(activities.length, 1);
  const [activity] = activities;
  assert.equal(activity.type, "utility");
  assert.equal(activity.name, "Использовать");
  assert.deepEqual(activity.consumption.targets, [{ type: "itemUses", target: "", value: "1" }]);
  assert.equal(activity.description.chatFlavor, "К вам на помощь приходит старый знакомый.");
  assert.match(item.system.description.value, /^<p>К вам на помощь приходит старый знакомый\.<\/p>$/);
  assert.deepEqual(item.flags["critical-rolls"], {
    kind: "luck", table: 4, variants, choice: 1, picked: [1], auto: [], fx: []
  });
});

test("«оставить оба»: по активности на каждый вариант", () => {
  const item = buildItemData({ kind: "fumble", table: 9, variants, choice: "both", labels: { ...labels, kind: "Неудача" } });
  assert.equal(item.name, "Неудача (на выбор)");
  assert.equal(item.img, "icons/magic/death/skull-humanoid-white-red.webp");
  const activities = Object.values(item.system.activities);
  assert.deepEqual(activities.map(a => a.name), [
    "Вы получаете бонус 1d4 на бросок атаки",
    "К вам на помощь приходит старый знакомый"
  ]);
  assert.ok(activities.every(a => a.img === item.img));
  assert.deepEqual(activities.map(a => a.description.chatFlavor), variants);
  assert.equal(new Set(activities.map(a => a._id)).size, 2);
  assert.ok(item.system.description.value.includes("<strong>Вариант 2.</strong>"));
  assert.ok(item.system.description.value.includes("[[/r 1d4]]"));
});

test("идентификаторы активностей: 16 латинских букв и цифр, ключ равен _id", () => {
  const item = buildItemData({ kind: "luck", table: 1, variants, choice: "both", labels });
  for ( const [key, activity] of Object.entries(item.system.activities) ) {
    assert.equal(key, activity._id);
    assert.match(activity._id, /^[A-Za-z0-9]{16}$/);
  }
});

test("единственный вариант в записи", () => {
  const item = buildItemData({ kind: "luck", table: 14, variants: [variants[0]], choice: 0, labels });
  assert.equal(Object.keys(item.system.activities).length, 1);
});
