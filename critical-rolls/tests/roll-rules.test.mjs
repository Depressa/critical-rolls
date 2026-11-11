import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFx, buildJobs } from "../scripts/effects-plan.mjs";
import {
  MESSAGE_ROLL_KINDS, consumeTypesFor, d20Flags, damageChange, damageRuleMatches, halfFormula, kindOfHooks,
  pendingModesFor, rollKindsOf, ruleMatches, tickFormula, turnAdvanced
} from "../scripts/roll-rules-plan.mjs";

const base = { who: "you", when: "always", duration: { type: "rounds", value: "1d4" } };

test("validateFx: правила бросков", () => {
  assert.deepEqual(validateFx({ type: "roll", rule: "disadvantage", rolls: ["attack"], scope: "melee", ...base }), []);
  assert.deepEqual(validateFx({ type: "roll", rule: "advantage", rolls: ["attack"], against: true, uses: 1, ...base }), []);
  assert.deepEqual(validateFx({ type: "roll", rule: "halfDamage", scope: "melee", uses: 2, ...base, duration: { type: "unspecified" } }), []);
  assert.deepEqual(validateFx({ type: "roll", rule: "disadvantage", rolls: ["attack", "check", "save"], abilities: ["dex", "str", "con"], ...base }), []);

  assert.ok(validateFx({ type: "roll", rule: "luck", rolls: ["attack"], ...base }).length);
  assert.ok(validateFx({ type: "roll", rule: "advantage", ...base }).length, "нет rolls");
  assert.ok(validateFx({ type: "roll", rule: "advantage", rolls: ["check"], against: true, ...base }).length, "against только атаки");
  assert.ok(validateFx({ type: "roll", rule: "halfDamage", rolls: ["attack"], ...base }).length, "rolls у урона не задаётся");
  assert.ok(validateFx({ type: "roll", rule: "advantage", rolls: ["save"], scope: "melee", ...base }).length);
  assert.ok(validateFx({ type: "roll", rule: "advantage", rolls: ["attack"], abilities: ["luck"], ...base }).length);
  assert.ok(validateFx({ type: "roll", rule: "advantage", rolls: ["attack"], uses: 0, ...base }).length);
});

test("validateFx: эффекты хода", () => {
  assert.deepEqual(validateFx({ type: "tick", at: "start", damage: "1d4", damageType: "fire", ...base }), []);
  assert.deepEqual(validateFx({ type: "tick", at: "end", damage: "quarterMax", damageType: null, ...base }), []);
  assert.deepEqual(validateFx({ type: "tick", at: "start", save: { ability: "con", dc: 12, fail: "blinded" }, ...base }), []);
  assert.ok(validateFx({ type: "tick", at: "middle", damage: "1d4", ...base }).length);
  assert.ok(validateFx({ type: "tick", at: "start", ...base }).length, "нужен урон или спасбросок");
  assert.ok(validateFx({ type: "tick", at: "start", save: { ability: "con", dc: 12, fail: "dead" }, ...base }).length);
});

test("validateFx: модификаторы с бонусом мастерства и счётчиком", () => {
  const mod = { type: "modifier", target: "attack", who: "you", when: "always", duration: { type: "unspecified" }, oneShot: "attack" };
  assert.deepEqual(validateFx({ ...mod, value: "-@prof" }), []);
  assert.deepEqual(validateFx({ ...mod, value: "+2 * @prof", target: "check", oneShot: "check" }), []);
  assert.deepEqual(validateFx({ ...mod, value: "-1d4", uses: 2 }), []);
  assert.ok(validateFx({ ...mod, value: "@prof" }).length, "нужен знак");
  assert.ok(validateFx({ ...mod, value: "-1d4", uses: 0 }).length);
});

test("ruleMatches: вид броска, область, характеристики, цели", () => {
  const attackDis = { rule: "disadvantage", rolls: ["attack"], scope: "melee" };
  assert.equal(ruleMatches(attackDis, { kind: "attack", scope: "melee" }), true);
  assert.equal(ruleMatches(attackDis, { kind: "attack", scope: "ranged" }), false);
  assert.equal(ruleMatches(attackDis, { kind: "save" }), false);

  const checks = { rule: "advantage", rolls: ["check"] };
  assert.equal(ruleMatches(checks, { kind: "check" }), true);
  assert.equal(ruleMatches(checks, { kind: "skill" }), true, "навык — тоже проверка");
  assert.equal(ruleMatches(checks, { kind: "tool" }), true);
  assert.equal(ruleMatches({ rule: "advantage", rolls: ["skill"] }, { kind: "check" }), false);
  assert.equal(ruleMatches({ rule: "advantage", rolls: ["skill"] }, { kind: "skill" }), true);

  const dex = { rule: "disadvantage", rolls: ["attack", "check", "save"], abilities: ["dex", "str"] };
  assert.equal(ruleMatches(dex, { kind: "save", ability: "dex" }), true);
  assert.equal(ruleMatches(dex, { kind: "save", ability: "wis" }), false);

  const against = { rule: "advantage", rolls: ["attack"], against: true };
  assert.equal(ruleMatches(against, { kind: "attack", against: true }), true);
  assert.equal(ruleMatches(against, { kind: "attack" }), false, "правило на цели не действует на её собственные атаки");
  assert.equal(ruleMatches({ rule: "advantage", rolls: ["attack"] }, { kind: "attack", against: true }), false);

  const same = { rule: "advantage", rolls: ["attack"], onlyTargets: ["Actor.t"] };
  assert.equal(ruleMatches(same, { kind: "attack", targetUuids: ["Actor.t", "Actor.x"] }), true);
  assert.equal(ruleMatches(same, { kind: "attack", targetUuids: ["Actor.x"] }), false);
  assert.equal(ruleMatches(same, { kind: "attack" }), false);

  assert.equal(ruleMatches({ rule: "halfDamage" }, { kind: "attack" }), false, "правила урона не для d20");
});

test("правила урона и режим d20", () => {
  assert.equal(damageRuleMatches({ rule: "halfDamage", scope: "melee" }, "melee"), true);
  assert.equal(damageRuleMatches({ rule: "halfDamage", scope: "melee" }, "ranged"), false);
  assert.equal(damageRuleMatches({ rule: "minDamage" }, null), true);
  assert.equal(damageRuleMatches({ rule: "advantage" }, "melee"), false);
  assert.equal(damageChange(["halfDamage", "minDamage"]), "min");
  assert.equal(damageChange(["halfDamage"]), "half");
  assert.equal(damageChange([]), null);
  assert.equal(halfFormula("2d6 + 3"), "floor((2d6 + 3) / 2)");
  assert.deepEqual(d20Flags(["advantage", "disadvantage"]), { advantage: true, disadvantage: true });
  assert.deepEqual(d20Flags([]), { advantage: false, disadvantage: false });
});

test("одна таблица видов бросков: модификаторы тратятся там, где dnd5e их добавляет", () => {
  // Бонус к проверкам идёт на проверки характеристик, навыков и инструментов; бонус к навыкам — только на навыки.
  assert.deepEqual(rollKindsOf("ability"), ["check"]);
  assert.deepEqual(rollKindsOf("skill"), ["check", "skill"]);
  assert.deepEqual(rollKindsOf("tool"), ["check"]);
  assert.deepEqual(rollKindsOf("attack"), ["attack"]);
  assert.deepEqual(rollKindsOf("damage"), ["damage"]);
  assert.deepEqual(rollKindsOf("save"), ["save"]);
  assert.deepEqual(rollKindsOf("concentration"), []);
  assert.deepEqual(rollKindsOf(undefined), []);
  // Все виды бросков правил и одноразовых модификаторов где-то тратятся.
  const covered = new Set(Object.values(MESSAGE_ROLL_KINDS).flat());
  for ( const kind of ["attack", "damage", "save", "check", "skill"] ) assert.ok(covered.has(kind), kind);

  assert.deepEqual(consumeTypesFor(["attack"]), ["attack"]);
  assert.deepEqual(new Set(consumeTypesFor(["check"])), new Set(["ability", "skill", "tool"]));
  assert.deepEqual(consumeTypesFor(["skill"]), ["skill"]);
  assert.deepEqual(consumeTypesFor(["save"]), ["save"]);
  assert.deepEqual(consumeTypesFor(undefined), []);
});

test("kindOfHooks: вид броска d20 по хукам dnd5e", () => {
  assert.equal(kindOfHooks(["attack", "d20Test"]), "attack");
  assert.equal(kindOfHooks(["SavingThrow", "d20Test"]), "save");
  assert.equal(kindOfHooks(["AbilityCheck", "d20Test"]), "check");
  assert.equal(kindOfHooks(["skill", "abilityCheck", "d20Test"]), "skill");
  assert.equal(kindOfHooks(["tool", "abilityCheck", "d20Test"]), "tool");
  assert.equal(kindOfHooks(["initiativeDialog", "abilityCheck", "d20Test"]), "check");
  assert.equal(kindOfHooks(["damage"]), null);
  assert.equal(kindOfHooks(), null);
});

test("turnAdvanced: шаг назад в бою эффекты хода не запускает", () => {
  assert.equal(turnAdvanced({ round: 1, turn: 0 }, { round: 1, turn: 1 }), true);
  assert.equal(turnAdvanced({ round: 1, turn: 3 }, { round: 2, turn: 0 }), true);
  assert.equal(turnAdvanced({ round: 1, turn: 1 }, { round: 1, turn: 0 }), false);
  assert.equal(turnAdvanced({ round: 2, turn: 0 }, { round: 1, turn: 3 }), false);
  assert.equal(turnAdvanced({ round: 1, turn: 1 }, { round: 1, turn: 1 }), false);
  assert.equal(turnAdvanced(null, { round: 1, turn: 0 }), true);
  assert.equal(turnAdvanced({ round: 1, turn: 0 }, null), false);
});

test("tickFormula", () => {
  assert.equal(tickFormula("1d4"), "1d4");
  assert.equal(tickFormula("quarterMax"), "floor(@attributes.hp.max / 4)");
});

test("buildJobs: «по той же цели» запоминает цели события", () => {
  const event = { actorUuid: "Actor.me", targetUuids: ["Actor.t"] };
  const fx = [{ type: "roll", rule: "advantage", rolls: ["attack"], sameTarget: true, ...base }];
  const [job] = buildJobs({ section: "hitPC", event, auto: [], fx });
  assert.deepEqual(job.onlyTargets, ["Actor.t"]);
  assert.deepEqual(job.targets, ["Actor.me"]);
});

test("pendingModesFor: правило урона действует только на урон той же атаки", () => {
  assert.deepEqual(pendingModesFor({ modes: ["halfDamage"], origin: "use1" }, "use1"), ["halfDamage"]);
  assert.deepEqual(pendingModesFor({ modes: ["halfDamage"], origin: "use1" }, "use2"), []);
  assert.deepEqual(pendingModesFor({ modes: ["halfDamage"], origin: null }, "use2"), ["halfDamage"]);
  assert.deepEqual(pendingModesFor(["minDamage"], "use2"), ["minDamage"]);
  assert.deepEqual(pendingModesFor(null, "use1"), []);
});
