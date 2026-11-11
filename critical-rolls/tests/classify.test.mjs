import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SECTIONS, attackKindOf, damageColumnOf, isTrackedType, sectionsFor, sideOf, signalOf, trackedSections
} from "../scripts/classify.mjs";

test("sideOf: персонаж всегда игрок, остальные по диспозиции", () => {
  assert.equal(sideOf("character", -1), "player");
  assert.equal(sideOf("npc", 1), "ally");
  assert.equal(sideOf("npc", 0), "neutral");
  assert.equal(sideOf("npc", -1), "enemy");
  assert.equal(sideOf("npc", -2), "enemy");
  assert.equal(sideOf("npc", undefined), "enemy");
  assert.equal(sideOf(undefined, undefined), "enemy");
});

test("attackKindOf", () => {
  assert.equal(attackKindOf({ classification: "spell", attackType: "ranged" }), "magic");
  assert.equal(attackKindOf({ classification: "weapon", attackType: "melee", itemSubtype: "natural" }), "natural");
  assert.equal(attackKindOf({ classification: "weapon", attackType: "ranged" }), "ranged");
  assert.equal(attackKindOf({ classification: "unarmed", attackType: "melee" }), "melee");
  assert.equal(attackKindOf({}), "melee");
});

test("damageColumnOf", () => {
  assert.equal(damageColumnOf({ types: ["slashing"] }), "slashing");
  assert.equal(damageColumnOf({ types: new Set(["piercing", "fire"]) }), "piercing");
  assert.equal(damageColumnOf({ types: ["fire", "slashing"] }), "magical");
  assert.equal(damageColumnOf({ types: ["slashing"], classification: "spell" }), "magical");
  assert.equal(damageColumnOf({ types: [] }), null);
  assert.equal(damageColumnOf({}), null);
});

test("sectionsFor: единица на атаке", () => {
  assert.deepEqual(sectionsFor({ natural: 1, rollType: "attack", side: "player" }), [SECTIONS.MISS, SECTIONS.FUMBLE]);
  assert.deepEqual(sectionsFor({ natural: 1, rollType: "attack", side: "enemy" }), [SECTIONS.MISS]);
  assert.deepEqual(sectionsFor({ natural: 1, rollType: "attack", side: "ally" }), [SECTIONS.MISS]);
});

test("sectionsFor: двадцатка на атаке", () => {
  assert.deepEqual(sectionsFor({ natural: 20, rollType: "attack", side: "player" }), [SECTIONS.HIT_PC, SECTIONS.LUCK]);
  assert.deepEqual(sectionsFor({ natural: 20, rollType: "attack", side: "ally" }), [SECTIONS.HIT_PC]);
  assert.deepEqual(sectionsFor({ natural: 20, rollType: "attack", side: "enemy" }), [SECTIONS.HIT_GM]);
  assert.deepEqual(sectionsFor({ natural: 20, rollType: "attack", side: "neutral" }), [SECTIONS.HIT_GM]);
});

test("sectionsFor: любые другие к20", () => {
  assert.deepEqual(sectionsFor({ natural: 1, rollType: "skill", side: "player" }), [SECTIONS.FUMBLE]);
  assert.deepEqual(sectionsFor({ natural: 20, rollType: "save", side: "player" }), [SECTIONS.LUCK]);
  assert.deepEqual(sectionsFor({ natural: 1, rollType: "skill", side: "enemy" }), []);
  assert.deepEqual(sectionsFor({ natural: 20, rollType: "ability", side: "ally" }), []);
});

test("sectionsFor: расширенный диапазон (19–20 и 1–2)", () => {
  const wide = { critMin: 19, fumbleMax: 2 };
  assert.deepEqual(sectionsFor({ natural: 19, rollType: "attack", side: "player", ...wide }), [SECTIONS.HIT_PC, SECTIONS.LUCK]);
  assert.deepEqual(sectionsFor({ natural: 19, rollType: "attack", side: "enemy", ...wide }), [SECTIONS.HIT_GM]);
  assert.deepEqual(sectionsFor({ natural: 2, rollType: "attack", side: "player", ...wide }), [SECTIONS.MISS, SECTIONS.FUMBLE]);
  assert.deepEqual(sectionsFor({ natural: 18, rollType: "skill", side: "player", ...wide }), []);
  assert.deepEqual(sectionsFor({ natural: 3, rollType: "skill", side: "player", ...wide }), []);
  // По умолчанию 19 и 2 ничего не запускают:
  assert.deepEqual(sectionsFor({ natural: 19, rollType: "attack", side: "player" }), []);
  assert.deepEqual(sectionsFor({ natural: 2, rollType: "attack", side: "player" }), []);
  assert.deepEqual(sectionsFor({ natural: 18, rollType: "attack", side: "player", critMin: 18 }), [SECTIONS.HIT_PC, SECTIONS.LUCK]);
});

test("sectionsFor: порог персонажа из dnd5e (Чемпион) действует только на него", () => {
  // Чемпион: система сама пометила 19 как критический бросок; у остальных такой пометки нет.
  assert.deepEqual(sectionsFor({ natural: 19, rollType: "attack", side: "player", ruleCrit: true }), [SECTIONS.HIT_PC, SECTIONS.LUCK]);
  assert.deepEqual(sectionsFor({ natural: 19, rollType: "attack", side: "player", ruleCrit: false }), []);
  assert.deepEqual(sectionsFor({ natural: 19, rollType: "attack", side: "enemy", ruleCrit: false }), []);
  assert.deepEqual(sectionsFor({ natural: 19, rollType: "attack", side: "enemy", ruleCrit: true }), [SECTIONS.HIT_GM]);
  assert.deepEqual(sectionsFor({ natural: 2, rollType: "attack", side: "player", ruleFumble: true }), [SECTIONS.MISS, SECTIONS.FUMBLE]);
  // Натуральная 20 срабатывает и без пометки системы:
  assert.deepEqual(sectionsFor({ natural: 20, rollType: "attack", side: "player" }), [SECTIONS.HIT_PC, SECTIONS.LUCK]);
});

test("sectionsFor: не 1 и не 20", () => {
  for ( const natural of [2, 10, 19] ) {
    assert.deepEqual(sectionsFor({ natural, rollType: "attack", side: "player" }), []);
  }
});

test("signalOf: 1, 20, пороги правил и обычные значения", () => {
  assert.equal(signalOf({ natural: 1 }), "fumble");
  assert.equal(signalOf({ natural: 20 }), "crit");
  assert.equal(signalOf({ natural: 19 }), null);
  assert.equal(signalOf({ natural: 19, ruleCrit: true }), "crit");
  assert.equal(signalOf({ natural: 19, critMin: 19 }), "crit");
  assert.equal(signalOf({ natural: 2, fumbleMax: 2 }), "fumble");
  assert.equal(signalOf({ natural: 5, ruleFumble: true }), "fumble");
});

test("isTrackedType: по умолчанию учитываются проверки и спасброски, атаки выключены", () => {
  assert.equal(isTrackedType("attack", {}), false);
  assert.equal(isTrackedType("attack", { trackAttacks: true }), true);
  assert.equal(isTrackedType("attack", { trackAttacks: false }), false);
  assert.equal(isTrackedType("ability", {}), true);
  assert.equal(isTrackedType("skill", { trackChecks: false }), false);
  assert.equal(isTrackedType("tool", { trackChecks: false }), false);
  assert.equal(isTrackedType("save", { trackSaves: false }), false);
  assert.equal(isTrackedType("other", {}), false);
  assert.equal(isTrackedType("other", { trackFreeRolls: true }), true);
});

test("trackedSections: при выключенном виде убираются только удача и неудача, промахи и попадания остаются", () => {
  const sections = [SECTIONS.MISS, SECTIONS.FUMBLE, SECTIONS.HIT_PC, SECTIONS.LUCK];
  assert.deepEqual(trackedSections(sections, true), sections);
  assert.deepEqual(trackedSections(sections, false), [SECTIONS.MISS, SECTIONS.HIT_PC]);
});

test("isTrackedType: необязательные типы выключены, пока их не включат", () => {
  assert.equal(isTrackedType("attack", {}), false);
  assert.equal(isTrackedType("attack", { trackAttacks: true }), true);
  assert.equal(isTrackedType("death", {}), false);
  assert.equal(isTrackedType("death", { trackDeathSaves: true }), true);
  assert.equal(isTrackedType("initiative", { trackDeathSaves: true }), false);
  assert.equal(isTrackedType("free", { trackFreeRolls: true }), true);
});
