import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SECTIONS } from "../scripts/classify.mjs";
import { buildJobs } from "../scripts/effects-plan.mjs";
import { durationText, jobView, modifierValueText } from "../scripts/card-text.mjs";

const lang = JSON.parse(readFileSync(new URL("../lang/ru.json", import.meta.url), "utf8"));
const load = name => JSON.parse(readFileSync(new URL(`../data/${name}.ru.json`, import.meta.url), "utf8"));
const resolve = path => path.split(".").reduce((node, part) => node?.[part], lang);

/**
 * Подписи из настоящего файла локализации. Ключи, которых там нет, собираются в `missing`.
 * @param {Set<string>} [missing]
 */
function api(missing=new Set()) {
  const localize = key => {
    const value = resolve(key);
    if ( typeof value !== "string" ) missing.add(key);
    return (typeof value === "string") ? value : key;
  };
  return {
    localize,
    format: (key, data) => localize(key).replace(/\{(\w+)\}/g, (_, name) => String(data?.[name] ?? `{${name}}`)),
    statusName: id => `«${id}»`,
    abilityName: id => id.toUpperCase(),
    nameOf: uuid => ({ "Actor.me": "Герой", "Actor.t1": "Орк" })[uuid] ?? null
  };
}

const event = { actorUuid: "Actor.me", targetUuids: ["Actor.t1"] };

test("durationText", () => {
  const t = api();
  assert.equal(durationText({ type: "rounds", value: "1d4" }, t), "на 1d4 р.");
  assert.equal(durationText({ type: "minutes", value: "10" }, t), "на 10 мин.");
  assert.equal(durationText({ type: "turnEnd" }, t), "до конца хода");
  assert.equal(durationText({ type: "rest", rest: "short" }, t), "до короткого отдыха");
  assert.equal(durationText({ type: "rest", rest: "long" }, t), "до продолжительного отдыха");
  assert.equal(durationText({ type: "permanent" }, t), "постоянно");
  assert.equal(durationText({ type: "unspecified" }, t), "");
  assert.equal(durationText(undefined, t), "");
});

test("modifierValueText: бонус мастерства и умножение читаются по-русски", () => {
  const t = api();
  assert.equal(modifierValueText("+2 * @prof", t), "+2 × бонус мастерства");
  assert.equal(modifierValueText("-@prof", t), "-бонус мастерства");
  assert.equal(modifierValueText("-1d4", t), "-1d4");
  assert.equal(modifierValueText(3, t), "3");
});

test("jobView: текст, цели и пометки", () => {
  const t = api();
  const [status, damage, crit] = buildJobs({
    section: SECTIONS.HIT_PC, event,
    auto: [{ status: "prone", who: "other", when: "always", duration: { type: "rounds", value: "2" } }],
    fx: [
      { type: "damage", formula: "1d6", damageType: "fire", who: "you", when: "failedSave" },
      { type: "crit", mode: "maxDouble" }
    ]
  });
  assert.deepEqual(jobView(status, t), {
    index: 0, text: "«prone» на 2 р. → Орк", note: "", applied: false, canApply: true, buttonLabel: "Применить"
  });
  assert.equal(jobView(damage, t).text, "Урон 1d6 (огонь) → Герой");
  assert.equal(jobView(damage, t).note, "после проваленного спасброска");
  assert.equal(jobView({ ...damage, applied: true }, t).note, "применено");
  assert.equal(jobView({ ...damage, applied: true, keptIrreversible: true }, t).note, "уже применено ранее, повторно не применяется");
  assert.equal(jobView({ ...damage, failed: "targets", targets: [] }, t).note, "нет цели: выделите токен и нажмите кнопку ещё раз");
  assert.equal(jobView({ ...damage, targets: [] }, t).text, "Урон 1d6 (огонь) → цель не определена");

  const awaiting = jobView(crit, t);
  assert.equal(awaiting.text, "Урон атаки: максимальный двойной");
  assert.equal(awaiting.note, "ждёт броска урона");
  assert.equal(awaiting.canApply, false);
  assert.equal(awaiting.buttonLabel, "Изменить урон");
  const pending = jobView({ ...crit, awaiting: false, plan: [{ index: 0 }] }, t);
  assert.equal(pending.note, "изменит бросок урона");
  assert.equal(pending.canApply, true);
  assert.equal(jobView({ ...crit, applied: true, change: { before: 12, after: 24 } }, t).note, "бросок урона изменён: было 12, стало 24");
  assert.equal(jobView({ ...crit, applied: true }, t).note, "бросок урона менять не нужно");
});

test("jobView: модификаторы, правила бросков и эффекты хода", () => {
  const t = api();
  const view = fx => jobView(buildJobs({ section: SECTIONS.MISS, event, fx: [fx] })[0], t).text;
  assert.equal(
    view({ type: "modifier", target: "attack", value: "-1d4", who: "you", when: "always", duration: { type: "unspecified" }, oneShot: "attack" }),
    "Атака -1d4 · на следующий бросок → Герой"
  );
  assert.equal(
    view({ type: "modifier", target: "attack", value: "-1d4", who: "you", when: "always", duration: { type: "unspecified" }, oneShot: "attack", uses: 2 }),
    "Атака -1d4 · на следующие броски: 2 → Герой"
  );
  assert.equal(
    view({ type: "modifier", target: "speed", value: "half", who: "other", when: "always", duration: { type: "rounds", value: "1d4" } }),
    "Скорость вдвое на 1d4 р. → Орк"
  );
  assert.equal(
    view({ type: "modifier", target: "damage", value: "+1d6", scope: "melee", who: "you", when: "always", duration: { type: "unspecified" } }),
    "Урон (рукопашные) +1d6 → Герой"
  );
  assert.equal(
    view({ type: "roll", rule: "disadvantage", rolls: ["attack", "save"], abilities: ["dex", "str"], who: "you", when: "always", duration: { type: "rounds", value: "1d4" } }),
    "Помеха: атаки, спасброски основанные на: DEX, STR на 1d4 р. → Герой"
  );
  assert.equal(
    view({ type: "roll", rule: "advantage", rolls: ["attack"], against: true, uses: 1, who: "you", when: "always", duration: { type: "unspecified" } }),
    "Преимущество: атаки по нему · только следующие: 1 → Герой"
  );
  assert.equal(
    view({ type: "roll", rule: "halfDamage", scope: "melee", uses: 2, who: "you", when: "always", duration: { type: "unspecified" } }),
    "Половина урона (рукопашные) · только следующие: 2 → Герой"
  );
  assert.equal(
    view({ type: "tick", at: "start", damage: "1d4", damageType: "cold", who: "you", when: "always", duration: { type: "unspecified" } }),
    "В начале хода: Урон 1d4 (холод) → Герой"
  );
  assert.equal(
    view({ type: "tick", at: "end", damage: "quarterMax", save: { ability: "con", dc: 12, fail: "blinded" }, who: "you", when: "always", duration: { type: "unspecified" } }),
    "В конце хода: Урон четверть максимума хитов; спасбросок CON Сл 12, при провале: «blinded» → Герой"
  );
  assert.equal(view({ type: "heal", formula: "2d4", who: "you", when: "always" }), "Лечение 2d4 → Герой");
  assert.equal(view({ type: "tempHp", formula: "2 * @prof", who: "you", when: "always" }), "Временные хиты 2 * @prof → Герой");
});

test("на реальных данных: у каждого размеченного эффекта есть текст, все ключи локализации существуют", () => {
  const missing = new Set();
  const t = api(missing);
  let count = 0;
  for ( const name of ["miss", "hit-gm", "hit-pc", "fumble", "luck"] ) {
    for ( const entry of load(name).entries ) {
      const lists = key => !entry[key] ? [] : (Array.isArray(entry[key]) ? entry[key] : Object.values(entry[key]));
      const auto = lists("auto").flat();
      const fx = lists("fx").flat();
      if ( !auto.length && !fx.length ) continue;
      // Раздел берётся «с колонками», чтобы ни один эффект не был отброшен как эффект предмета.
      for ( const job of buildJobs({ section: SECTIONS.HIT_PC, event, auto, fx }) ) {
        for ( const variant of [job, { ...job, applied: true }, { ...job, targets: [] }] ) {
          const view = jobView(variant, t);
          assert.ok(view.text.length > 0, `${name} #${entry.table}: пустой текст`);
          for ( const bad of ["undefined", "null", "[object", "CRITROLLS.", "{"] ) {
            assert.ok(!view.text.includes(bad) && !view.note.includes(bad), `${name} #${entry.table}: «${bad}» в тексте «${view.text}» / «${view.note}»`);
          }
          assert.ok(view.buttonLabel.length > 0);
        }
        count++;
      }
    }
  }
  assert.deepEqual([...missing], [], "нет ключей локализации");
  assert.ok(count > 500, `эффектов проверено: ${count}`);
});
