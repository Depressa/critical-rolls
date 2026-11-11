import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SECTIONS } from "../scripts/classify.mjs";
import { columnsOf, isColumnSection } from "../scripts/tables.mjs";
import {
  buildFormula, buildItemJobs, buildJobs, consumeOn, critOperation, durationPlan, irreversibleDone, isAutomatic,
  isDamageForEvent, keepIrreversible, modifierChanges, resolveTargets, validateAuto, validateFx
} from "../scripts/effects-plan.mjs";

const load = name => JSON.parse(readFileSync(new URL(`../data/${name}.ru.json`, import.meta.url), "utf8"));
const event = { actorUuid: "Actor.attacker", targetUuids: ["Actor.victim"] };

test("resolveTargets: кто такие «вы» и «другой» в каждом разделе", () => {
  assert.deepEqual(resolveTargets(SECTIONS.MISS, "you", event), ["Actor.attacker"]);
  assert.deepEqual(resolveTargets(SECTIONS.MISS, "other", event), ["Actor.victim"]);
  assert.deepEqual(resolveTargets(SECTIONS.HIT_GM, "you", event), ["Actor.victim"]);
  assert.deepEqual(resolveTargets(SECTIONS.HIT_GM, "other", event), ["Actor.attacker"]);
  assert.deepEqual(resolveTargets(SECTIONS.HIT_PC, "you", event), ["Actor.attacker"]);
  assert.deepEqual(resolveTargets(SECTIONS.HIT_PC, "other", event), ["Actor.victim"]);
  assert.deepEqual(resolveTargets(SECTIONS.MISS, "other", { actorUuid: "Actor.a" }), []);
});

test("durationPlan", () => {
  assert.deepEqual(durationPlan({ type: "rounds", value: "1d4" }), { unit: "rounds", formula: "1d4", factor: 1 });
  assert.deepEqual(durationPlan({ type: "turnEnd" }), { unit: "rounds", formula: "1", factor: 1 });
  assert.deepEqual(durationPlan({ type: "minutes", value: "1" }), { unit: "rounds", formula: "1", factor: 10 });
  assert.deepEqual(durationPlan({ type: "hours", value: "1d4" }), { unit: "seconds", formula: "1d4", factor: 3600 });
  assert.deepEqual(durationPlan({ type: "days", value: "2" }), { unit: "seconds", formula: "2", factor: 86400 });
  assert.deepEqual(durationPlan({ type: "rest", rest: "short" }), { unit: "rest", rest: "short" });
  assert.deepEqual(durationPlan({ type: "permanent" }), { unit: null });
  assert.deepEqual(durationPlan(undefined), { unit: null });
});

test("modifierChanges: пути полей dnd5e", () => {
  const keys = fx => modifierChanges(fx).map(c => c.key);
  assert.deepEqual(keys({ target: "attack", value: "-1d4" }),
    ["system.bonuses.mwak.attack", "system.bonuses.rwak.attack", "system.bonuses.msak.attack", "system.bonuses.rsak.attack"]);
  assert.deepEqual(keys({ target: "attack", value: "-1d4", scope: "ranged" }),
    ["system.bonuses.rwak.attack", "system.bonuses.rsak.attack"]);
  assert.deepEqual(keys({ target: "damage", value: "+1d6", scope: "melee" }),
    ["system.bonuses.mwak.damage", "system.bonuses.msak.damage"]);
  assert.deepEqual(keys({ target: "save", value: "-1d4" }), ["system.bonuses.abilities.save"]);
  assert.deepEqual(keys({ target: "check", value: "-1d4" }), ["system.bonuses.abilities.check"]);
  assert.deepEqual(keys({ target: "skill", value: "+1d6" }), ["system.bonuses.abilities.skill"]);
  assert.deepEqual(modifierChanges({ target: "attack", value: "-1d4", scope: "all" })[0], {
    key: "system.bonuses.mwak.attack", mode: 2, value: "-1d4"
  });
});

test("modifierChanges: КД и скорость принимают числа", () => {
  assert.deepEqual(modifierChanges({ target: "ac", value: "-1d4" }, -3), [
    { key: "system.attributes.ac.bonus", mode: 2, value: "-3" }
  ]);
  assert.deepEqual(modifierChanges({ target: "ac", value: "-2" }), [
    { key: "system.attributes.ac.bonus", mode: 2, value: "-2" }
  ]);
  assert.deepEqual(modifierChanges({ target: "speed", value: "half" }), [
    { key: "system.attributes.movement.walk", mode: 1, value: "0.5" }
  ]);
  assert.deepEqual(modifierChanges({ target: "speed", value: "zero" }), [
    { key: "system.attributes.movement.walk", mode: 5, value: "0" }
  ]);
  assert.deepEqual(modifierChanges({ target: "speed", value: "-10" }), [
    { key: "system.attributes.movement.walk", mode: 2, value: "-10" }
  ]);
});

test("consumeOn: урон от атаки снимается на броске урона", () => {
  assert.equal(consumeOn({ target: "attack", oneShot: "attack" }), "attack");
  assert.equal(consumeOn({ target: "damage", oneShot: "attack" }), "damage");
  assert.equal(consumeOn({ target: "save", oneShot: "save" }), "save");
  assert.equal(consumeOn({ target: "ac" }), null);
  assert.equal(consumeOn({ target: "attack", oneShot: null }), null);
});

test("critOperation: множитель умножает итог, «максимальный» берёт кубики на максимум", () => {
  assert.deepEqual(critOperation("double"), { factor: 2, maximize: false });
  assert.deepEqual(critOperation("triple"), { factor: 3, maximize: false });
  assert.deepEqual(critOperation("quadruple"), { factor: 4, maximize: false });
  assert.deepEqual(critOperation("quintuple"), { factor: 5, maximize: false });
  assert.deepEqual(critOperation("maxPlus"), { factor: 1, maximize: true, extraRoll: true });
  assert.deepEqual(critOperation("max"), { factor: 1, maximize: true });
  assert.deepEqual(critOperation("maxDouble"), { factor: 2, maximize: true });
  assert.deepEqual(critOperation("maxTriple"), { factor: 3, maximize: true });
  assert.deepEqual(critOperation("maxQuadruple"), { factor: 4, maximize: true });
  assert.equal(critOperation("неизвестный"), null);
});

test("buildFormula: исходный урон Arcane Burst 4d10, а не удвоенный критом", () => {
  const terms = [
    { type: "dice", number: 4, faces: 10 },
    { type: "raw", formula: " + " },
    { type: "raw", formula: "3" }
  ];
  assert.equal(buildFormula(terms), "4d10 + 3");
  assert.equal(buildFormula(terms, { factor: 1 }), "4d10 + 3");
  assert.equal(buildFormula(terms, { factor: 2 }), "(4d10 + 3) * 2");
  assert.equal(buildFormula(terms, { factor: 3 }), "(4d10 + 3) * 3");
  assert.equal(buildFormula([{ type: "dice", number: 2, faces: 6, modifiers: "kh1" }], { factor: 2 }), "(2d6kh1) * 2");
});

test("validateAuto и validateFx", () => {
  assert.deepEqual(validateAuto({ status: "blinded", who: "you", when: "always", duration: { type: "rounds", value: "1d4" } }), []);
  assert.ok(validateAuto({ status: "dead", who: "you", when: "always", duration: { type: "permanent" } }).length);
  assert.ok(validateAuto({ status: "blinded", who: "me", when: "always", duration: { type: "permanent" } }).length);
  assert.ok(validateAuto({ status: "blinded", who: "you", when: "always", duration: { type: "rounds", value: "много" } }).length);

  assert.deepEqual(validateFx({ type: "damage", formula: "1d4", damageType: "cold", who: "you", when: "always" }), []);
  assert.deepEqual(validateFx({ type: "damage", formula: "5", damageType: null, who: "other", when: "failedSave" }), []);
  assert.ok(validateFx({ type: "damage", formula: "1d4", damageType: "psionic", who: "you", when: "always" }).length);
  assert.deepEqual(validateFx({ type: "tempHp", formula: "2*@prof", who: "you", when: "always" }), []);
  assert.deepEqual(validateFx({ type: "crit", mode: "maxDouble" }), []);
  assert.ok(validateFx({ type: "crit", mode: "x5" }).length);
  assert.deepEqual(validateFx({
    type: "modifier", target: "speed", value: "half", who: "other", when: "always", duration: { type: "unspecified" }
  }), []);
  assert.ok(validateFx({
    type: "modifier", target: "ac", value: "minus", who: "other", when: "always", duration: { type: "unspecified" }
  }).length);
  assert.ok(validateFx({ type: "teleport" }).length);
});

test("buildJobs: состояния, прочие эффекты и разделы с вариантами", () => {
  const auto = [{ status: "blinded", who: "other", when: "always", duration: { type: "rounds", value: "1" } }];
  const fx = [
    { type: "damage", formula: "1d4", damageType: "fire", who: "you", when: "failedSave" },
    { type: "crit", mode: "double" }
  ];
  const jobs = buildJobs({ section: SECTIONS.HIT_PC, event, auto, fx });
  assert.equal(jobs.length, 3);
  assert.deepEqual(jobs.map(j => j.kind), ["status", "damage", "crit"]);
  assert.deepEqual(jobs.map(j => j.index), [0, 1, 2]);
  assert.deepEqual(jobs[0].targets, ["Actor.victim"]);
  assert.deepEqual(jobs[1].targets, ["Actor.attacker"]);
  assert.deepEqual(jobs[2].targets, []);
  assert.equal(jobs[2].awaiting, true);
  assert.equal(jobs[2].when, "always");
  assert.ok(jobs.every(j => j.applied === false && j.effectUuids.length === 0));

  assert.deepEqual(buildJobs({ section: SECTIONS.FUMBLE, event, auto, fx }), []);
  assert.deepEqual(buildJobs({ section: SECTIONS.MISS, event, auto: undefined, fx: undefined }), []);
});

test("isAutomatic: сами накладываются только безусловные эффекты с известной целью", () => {
  const base = { kind: "status", when: "always", targets: ["Actor.x"] };
  assert.equal(isAutomatic(base, true), true);
  assert.equal(isAutomatic(base, false), false);
  assert.equal(isAutomatic({ ...base, when: "failedSave" }, true), false);
  assert.equal(isAutomatic({ ...base, when: "choice" }, true), false);
  assert.equal(isAutomatic({ ...base, targets: [] }, true), false);
  assert.equal(isAutomatic({ kind: "crit", when: "always", targets: [] }, true), true);
});

test("разметка в данных: все записи проходят проверку, колонки названы верно, лишних полей длительности нет", () => {
  const counts = { auto: 0, fx: 0 };
  const FILES = { miss: SECTIONS.MISS, "hit-gm": SECTIONS.HIT_GM, "hit-pc": SECTIONS.HIT_PC, fumble: SECTIONS.FUMBLE, luck: SECTIONS.LUCK };
  for ( const [name, section] of Object.entries(FILES) ) {
    const { entries } = load(name);
    for ( const entry of entries ) {
      for ( const key of ["auto", "fx"] ) {
        if ( !entry[key] ) continue;
        const lists = Array.isArray(entry[key]) ? entry[key] : Object.values(entry[key]);
        if ( Array.isArray(entry[key]) ) {
          assert.ok(!isColumnSection(section), `${name} #${entry.table} ${key}: у раздела с колонками разметка по колонкам`);
          assert.equal(entry[key].length, entry.variants.length, `${name} #${entry.table}`);
        } else {
          // Опечатка в имени колонки («slashng») молча отключила бы эффект.
          assert.ok(isColumnSection(section), `${name} #${entry.table} ${key}: у раздела с вариантами разметка по вариантам`);
          for ( const column of Object.keys(entry[key]) ) {
            assert.ok(columnsOf(section).includes(column), `${name} #${entry.table} ${key}: неизвестная колонка ${column}`);
          }
        }
        for ( const list of lists ) {
          for ( const item of list ) {
            const errors = key === "auto" ? validateAuto(item) : validateFx(item);
            assert.deepEqual(errors, [], `${name} #${entry.table} ${key}`);
            if ( item.duration ) assert.ok(!("whose" in item.duration), `${name} #${entry.table} ${key}: duration.whose не читается`);
            counts[key]++;
          }
        }
      }
    }
  }
  assert.ok(counts.auto > 90 && counts.fx > 400, JSON.stringify(counts));
});

test("buildItemJobs: эффекты предмета берутся из разметки, «вы» — владелец, «другой» — цели игрока", () => {
  const jobs = buildItemJobs({
    actorUuid: "Actor.me",
    targets: ["Actor.t1"],
    auto: [{ status: "prone", who: "other", when: "always", duration: { type: "turnEnd" } }],
    fx: [
      { type: "modifier", target: "attack", value: "+1d4", who: "you", when: "always", duration: { type: "unspecified" } },
      { type: "damage", formula: "1d6", who: "other", when: "choice" },
      { type: "crit", mode: "double", who: "other", when: "always" }
    ]
  });
  assert.deepEqual(jobs.map(job => [job.kind, job.targets]), [["status", ["Actor.t1"]], ["modifier", ["Actor.me"]]]);
  assert.ok(jobs.every(job => (job.when === "always") && !job.applied && Array.isArray(job.effectUuids)));
  assert.deepEqual(buildItemJobs({ actorUuid: "a", targets: [], auto: [{ status: "prone", who: "other", when: "always" }] }), []);
});

test("keepIrreversible: урон и лечение не применяются повторно, эффекты — применяются", () => {
  const jobs = [
    { index: 0, kind: "damage", formula: "1d6" },
    { index: 1, kind: "status", status: "prone" },
    { index: 2, kind: "heal", formula: "5" }
  ];
  const marked = keepIrreversible(jobs, [0, 1]);
  assert.ok(marked[0].keptIrreversible && marked[0].applied);
  assert.ok(!marked[1].keptIrreversible);
  assert.deepEqual(marked.filter(job => !job.keptIrreversible).map(job => job.index), [1, 2]);
  assert.deepEqual(keepIrreversible(jobs), jobs);
  assert.deepEqual(irreversibleDone([{ index: 0, kind: "damage", applied: true }, { index: 1, kind: "status", applied: true },
    { index: 2, kind: "heal", applied: false }]), [0]);
});

test("isDamageForEvent: по общему использованию, иначе по актору, предмету и времени", () => {
  const event = { actorUuid: "Actor.a", itemUuid: "Item.sword", usageMessageId: "use1" };
  assert.ok(isDamageForEvent(event, { type: "damage", originatingMessage: "use1", actorUuid: "Actor.b", timestamp: 0 }, 100));
  assert.ok(!isDamageForEvent(event, { type: "damage", originatingMessage: "use2", actorUuid: "Actor.a", timestamp: 200 }, 100));
  const loose = { actorUuid: "Actor.a", itemUuid: "Item.sword", usageMessageId: null };
  assert.ok(isDamageForEvent(loose, { type: "damage", actorUuid: "Actor.a", itemUuid: "Item.sword", timestamp: 200 }, 100));
  assert.ok(!isDamageForEvent(loose, { type: "damage", actorUuid: "Actor.a", itemUuid: "Item.bow", timestamp: 200 }, 100));
  assert.ok(!isDamageForEvent(loose, { type: "damage", actorUuid: "Actor.a", itemUuid: "Item.sword", timestamp: 50 }, 100));
  assert.ok(!isDamageForEvent(loose, { type: "attack", actorUuid: "Actor.a", timestamp: 200 }, 100));
});
