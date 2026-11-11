import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTIONS } from "../scripts/classify.mjs";
import {
  buttonsFor, initialState, nextState, participantUuids, sameDecision, wantsDialog
} from "../scripts/card-state.mjs";

test("participantUuids: бросавший, а у попаданий Мастера — герои, по которым попали", () => {
  const event = { actorUuid: "Actor.orc", targetUuids: ["Actor.hero", "Actor.ally"] };
  assert.deepEqual(participantUuids(SECTIONS.HIT_GM, event), ["Actor.hero", "Actor.ally"]);
  assert.deepEqual(participantUuids(SECTIONS.MISS, event), ["Actor.orc"]);
  assert.deepEqual(participantUuids(SECTIONS.HIT_PC, event), ["Actor.orc"]);
  assert.deepEqual(participantUuids(SECTIONS.LUCK, event), ["Actor.orc"]);
  assert.deepEqual(participantUuids(SECTIONS.HIT_GM, { actorUuid: "Actor.orc" }), []);
  assert.deepEqual(participantUuids(SECTIONS.MISS, { actorUuid: null }), []);
});

test("initialState", () => {
  assert.equal(initialState({ auto: false, section: SECTIONS.LUCK, variantCount: 2, missing: false }).status, "pending");
  assert.equal(initialState({ auto: false, section: SECTIONS.LUCK, variantCount: 2, missing: true }).status, "none");
  assert.deepEqual(
    initialState({ auto: true, section: SECTIONS.LUCK, variantCount: 2, missing: false }),
    { status: "applied", choice: "both", rerolls: 0 }
  );
  assert.equal(initialState({ auto: true, section: SECTIONS.FUMBLE, variantCount: 1, missing: false }).choice, 0);
  assert.equal(initialState({ auto: true, section: SECTIONS.MISS, variantCount: 0, missing: false }).choice, null);
});

test("buttonsFor", () => {
  const actions = buttons => buttons.map(b => `${b.action}${b.value ?? ""}`);
  assert.deepEqual(actions(buttonsFor(SECTIONS.LUCK, 2)), ["choose0", "choose1", "chooseboth", "decline", "reroll"]);
  assert.deepEqual(actions(buttonsFor(SECTIONS.LUCK, 1)), ["choose0", "decline", "reroll"]);
  assert.deepEqual(actions(buttonsFor(SECTIONS.MISS, 0)), ["apply", "decline", "reroll"]);
});

test("nextState: выбор варианта", () => {
  const pending = { status: "pending", choice: null, rerolls: 0 };
  const ctx = { variantCount: 2, isVariantSection: true };
  assert.deepEqual(nextState(pending, "choose", { ...ctx, value: "1" }), { status: "applied", choice: 1, rerolls: 0 });
  assert.deepEqual(nextState(pending, "choose", { ...ctx, value: "both" }), { status: "applied", choice: "both", rerolls: 0 });
  assert.equal(nextState(pending, "choose", { ...ctx, value: "2" }), null);
  assert.equal(nextState(pending, "choose", { ...ctx, value: "-1" }), null);
  assert.equal(nextState(pending, "choose", { ...ctx, value: "abc" }), null);
  assert.equal(nextState(pending, "choose", { variantCount: 1, isVariantSection: true, value: "both" }), null);
  assert.equal(nextState(pending, "choose", { variantCount: 2, isVariantSection: false, value: "0" }), null);
});

test("nextState: применить, отказаться, перебросить", () => {
  const pending = { status: "pending", choice: null, rerolls: 1 };
  const plain = { variantCount: 0, isVariantSection: false };
  assert.equal(nextState(pending, "apply", plain).status, "applied");
  assert.equal(nextState(pending, "apply", { variantCount: 2, isVariantSection: true }), null);
  assert.equal(nextState(pending, "decline", plain).status, "declined");
  assert.deepEqual(nextState(pending, "reroll", plain), { status: "pending", choice: null, rerolls: 2 });
  assert.equal(nextState(pending, "unknown", plain), null);
});

test("nextState: Мастер может пересмотреть решённую карточку", () => {
  const ctx = { variantCount: 2, isVariantSection: true, revise: true };
  const applied = { status: "applied", choice: 0, rerolls: 0 };
  assert.deepEqual(nextState(applied, "choose", { ...ctx, value: "1" }), { status: "applied", choice: 1, rerolls: 0 });
  assert.deepEqual(nextState(applied, "choose", { ...ctx, value: "both" }), { status: "applied", choice: "both", rerolls: 0 });
  assert.equal(nextState(applied, "decline", ctx).status, "declined");
  assert.deepEqual(nextState(applied, "reroll", ctx), { status: "pending", choice: null, rerolls: 1 });

  const declined = { status: "declined", choice: null, rerolls: 0 };
  assert.deepEqual(nextState(declined, "choose", { ...ctx, value: "0" }), { status: "applied", choice: 0, rerolls: 0 });
  assert.equal(nextState({ status: "none", choice: null, rerolls: 0 }, "decline", ctx), null);
});

test("nextState: решённую карточку без права пересмотра изменить нельзя", () => {
  const plain = { variantCount: 2, isVariantSection: true, value: "0" };
  for ( const status of ["applied", "declined", "none"] ) {
    const state = { status, choice: null, rerolls: 0 };
    for ( const action of ["apply", "choose", "decline", "reroll"] ) assert.equal(nextState(state, action, plain), null);
  }
});

test("wantsDialog: кому открывать окно", () => {
  const base = { enabled: true, canAct: true, participates: false, isGM: true, isActiveGM: true, ownerOnline: false };
  assert.equal(wantsDialog(base), true);
  assert.equal(wantsDialog({ ...base, enabled: false }), false);
  assert.equal(wantsDialog({ ...base, canAct: false }), false);
  assert.equal(wantsDialog({ ...base, isActiveGM: false }), false);
  // игрок решает и в сети: окно у игрока, у Мастера нет
  assert.equal(wantsDialog({ ...base, participates: true, ownerOnline: true }), false);
  assert.equal(wantsDialog({ ...base, isGM: false, isActiveGM: false, participates: true, ownerOnline: true }), true);
  // игрок решает, но его нет в сети: решает Мастер
  assert.equal(wantsDialog({ ...base, participates: true, ownerOnline: false }), true);
  // игроку без права участвовать окно не нужно
  assert.equal(wantsDialog({ ...base, isGM: false, isActiveGM: false, participates: false }), false);
});

test("sameDecision: пересмотр без изменений не считается решением", () => {
  assert.ok(sameDecision({ status: "applied", choice: null }, { status: "applied" }));
  assert.ok(sameDecision({ status: "applied", choice: 1 }, { status: "applied", choice: 1 }));
  assert.ok(!sameDecision({ status: "applied", choice: 1 }, { status: "applied", choice: 0 }));
  assert.ok(!sameDecision({ status: "applied" }, { status: "declined" }));
});
