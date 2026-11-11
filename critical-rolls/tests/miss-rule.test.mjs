import { test } from "node:test";
import assert from "node:assert/strict";
import { hasMissRecord, normalizeLimit, normalizeList, shouldSkipMiss, updateMissList } from "../scripts/miss-rule.mjs";

test("частота промаха: неизвестное значение настройки заменяется на «раз за раунд»", () => {
  assert.equal(normalizeLimit("combat"), "combat");
  assert.equal(normalizeLimit("round"), "round");
  assert.equal(normalizeLimit("any"), "any");
  assert.equal(normalizeLimit("all"), "round");
  assert.equal(normalizeLimit(undefined), "round");
});

test("запись о промахе: за бой действует во всех раундах, за раунд только в своём, любой не ограничивает", () => {
  const list = [{ uuid: "a", messageId: "m1", round: 2 }];
  assert.equal(hasMissRecord(list, "a", "combat", 5), true);
  assert.equal(hasMissRecord(list, "a", "round", 2), true);
  assert.equal(hasMissRecord(list, "a", "round", 3), false);
  assert.equal(hasMissRecord(list, "a", "any", 2), false);
  assert.equal(hasMissRecord(list, "b", "combat", 2), false);
  assert.equal(hasMissRecord(undefined, "a", "combat", 2), false);
});

test("пропуск промаха: только в начатом бою, если запись есть и ограничение включено; касается всех сторон", () => {
  const base = { limit: "round", inCombat: true, alreadyApplied: true };
  assert.equal(shouldSkipMiss(base), true);
  assert.equal(shouldSkipMiss({ ...base, limit: "combat" }), true);
  assert.equal(shouldSkipMiss({ ...base, limit: "any" }), false);
  assert.equal(shouldSkipMiss({ ...base, inCombat: false }), false);
  assert.equal(shouldSkipMiss({ ...base, alreadyApplied: false }), false);
});

test("список записей: по записи на карточку, отклонённая карточка снимает только свою запись", () => {
  const first = { uuid: "a", messageId: "m1", round: 1 };
  const second = { uuid: "a", messageId: "m2", round: 1 };
  assert.deepEqual(updateMissList(undefined, first, true), [first]);
  // Вторая карточка того же персонажа (брошена, пока первая ждала) не затирает первую.
  const both = updateMissList([first], second, true);
  assert.deepEqual(both, [first, second]);
  // Отказ по первой карточке оставляет запись второй: промах всё ещё учтён.
  assert.deepEqual(updateMissList(both, first, false), [second]);
  assert.equal(hasMissRecord(updateMissList(both, first, false), "a", "round", 1), true);
  // Повторное решение по той же карточке запись не дублирует.
  assert.deepEqual(updateMissList(both, { ...second, round: 3 }, true), [first, { ...second, round: 3 }]);
  assert.deepEqual(updateMissList([{ uuid: "b", messageId: "m9", round: 2 }], first, false), [{ uuid: "b", messageId: "m9", round: 2 }]);
});

test("прежние форматы записей (список UUID, запись без карточки) читаются и заменяются записью того же актора", () => {
  const list = normalizeList(["a", { uuid: "b", round: 2 }]);
  assert.deepEqual(list, [{ uuid: "a", messageId: null, round: null }, { uuid: "b", messageId: null, round: 2 }]);
  assert.equal(hasMissRecord(list, "a", "combat", 4), true);
  assert.equal(hasMissRecord(list, "a", "round", 4), false);
  assert.deepEqual(updateMissList(list, { uuid: "a", messageId: "m1", round: 4 }, false), [{ uuid: "b", messageId: null, round: 2 }]);
});

test("пример боя: за раунд один эффект, в новом раунде снова", () => {
  let list = [];
  const round1 = hasMissRecord(list, "orc", "round", 1);
  assert.equal(shouldSkipMiss({ limit: "round", inCombat: true, alreadyApplied: round1 }), false);
  list = updateMissList(list, { uuid: "orc", messageId: "m1", round: 1 }, true);
  assert.equal(shouldSkipMiss({ limit: "round", inCombat: true, alreadyApplied: hasMissRecord(list, "orc", "round", 1) }), true);
  assert.equal(shouldSkipMiss({ limit: "round", inCombat: true, alreadyApplied: hasMissRecord(list, "orc", "round", 2) }), false);
  assert.equal(shouldSkipMiss({ limit: "combat", inCombat: true, alreadyApplied: hasMissRecord(list, "orc", "combat", 2) }), true);
});
