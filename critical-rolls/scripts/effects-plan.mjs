import { SECTIONS } from "./classify.mjs";

/**
 * Чистая логика автоприменения эффектов (не зависит от Foundry, проверяется тестами).
 *
 * В данных у ячейки с механическим эффектом есть разметка:
 * - `auto`: список состояний `{ status, who, when, duration }`;
 * - `fx`: список остальных эффектов (`damage`, `heal`, `tempHp`, `modifier`, `crit`, `roll`, `tick`).
 * Поля:
 * - `who`: `you` — тот, к кому обращён текст, `other` — кто-то другой (цель, противник, атакующий).
 * - `when`: `always` — без условий, `failedSave` — только при проваленном спасброске, `choice` — по решению Мастера.
 */

/** Допустимые состояния (идентификаторы dnd5e). */
const STATUSES = Object.freeze([
  "blinded", "deafened", "charmed", "frightened", "prone", "grappled", "paralyzed", "petrified", "poisoned",
  "restrained", "stunned", "unconscious", "incapacitated", "invisible", "exhaustion"
]);

/** Типы урона dnd5e. */
const DAMAGE_TYPES = Object.freeze([
  "acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant",
  "slashing", "thunder"
]);

const WHO = Object.freeze(["you", "other"]);
const WHEN = Object.freeze(["always", "failedSave", "choice"]);
const DURATION_TYPES = Object.freeze(["rounds", "turnEnd", "minutes", "hours", "days", "rest", "permanent", "unspecified"]);
const MODIFIER_TARGETS = Object.freeze(["ac", "speed", "attack", "damage", "save", "check", "skill"]);
const ONE_SHOTS = Object.freeze(["attack", "save", "check", "skill"]);
const ABILITIES = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);

/** Правила бросков: преимущество и помеха на d20, половина и минимум урона атаки. */
const ROLL_RULES = Object.freeze(["advantage", "disadvantage", "halfDamage", "minDamage"]);
export const DAMAGE_RULES = Object.freeze(["halfDamage", "minDamage"]);
/** К каким броскам d20 применяются преимущество и помеха. */
const ROLL_KINDS = Object.freeze(["attack", "check", "save", "skill"]);
const CRIT_MODES = Object.freeze([
  "double", "triple", "quadruple", "quintuple", "max", "maxDouble", "maxTriple", "maxQuadruple", "maxPlus"
]);

/** Значение числового модификатора: `+2`, `-1d4`, `+2 * @prof`, `-@prof`. */
const MODIFIER_VALUE = /^[+-](?:\d+(?:d\d+)?|(?:\d+\s?\*\s?)?@prof)$/;

/** Подходит ли строка как формула: число или кубики с необязательным модификатором и общими переменными. */
const FORMULA = /^(?:\d+(?:d\d+)?(?:\s?[+-]\s?\d+)?|\d+\s?\*\s?@prof|@prof(?:\s?\*\s?\d+)?)$/;

/**
 * Проверяет длительность. Возвращает список ошибок.
 * @param {object} duration
 * @returns {string[]}
 */
function validateDuration(duration) {
  if ( !DURATION_TYPES.includes(duration?.type) ) return [`duration.type: ${duration?.type}`];
  if ( ["rounds", "minutes", "hours", "days"].includes(duration.type) && !/^\d+(?:d\d+)?(?:[+-]\d+)?$/.test(String(duration.value)) ) {
    return [`duration.value: ${duration.value}`];
  }
  if ( (duration.type === "rest") && !["short", "long"].includes(duration.rest) ) return [`duration.rest: ${duration.rest}`];
  return [];
}

/**
 * Проверяет запись разметки состояния. Возвращает список ошибок (пустой, если запись верна).
 * @param {object} auto
 * @returns {string[]}
 */
export function validateAuto(auto) {
  const errors = [];
  if ( !STATUSES.includes(auto?.status) ) errors.push(`status: ${auto?.status}`);
  if ( !WHO.includes(auto?.who) ) errors.push(`who: ${auto?.who}`);
  if ( !WHEN.includes(auto?.when) ) errors.push(`when: ${auto?.when}`);
  errors.push(...validateDuration(auto?.duration));
  return errors;
}

/**
 * Проверяет запись разметки остальных эффектов. Возвращает список ошибок.
 * @param {object} fx
 * @returns {string[]}
 */
export function validateFx(fx) {
  const errors = [];
  const type = fx?.type;
  if ( type === "crit" ) {
    if ( !CRIT_MODES.includes(fx.mode) ) errors.push(`mode: ${fx.mode}`);
    if ( fx.when && !WHEN.includes(fx.when) ) errors.push(`when: ${fx.when}`);
    return errors;
  }
  if ( !WHO.includes(fx?.who) ) errors.push(`who: ${fx?.who}`);
  if ( !WHEN.includes(fx?.when) ) errors.push(`when: ${fx?.when}`);

  switch ( type ) {
    case "damage":
      if ( !FORMULA.test(String(fx.formula)) ) errors.push(`formula: ${fx.formula}`);
      if ( (fx.damageType !== null) && !DAMAGE_TYPES.includes(fx.damageType) ) errors.push(`damageType: ${fx.damageType}`);
      break;
    case "heal":
    case "tempHp":
      if ( !FORMULA.test(String(fx.formula)) ) errors.push(`formula: ${fx.formula}`);
      break;
    case "modifier":
      if ( !MODIFIER_TARGETS.includes(fx.target) ) errors.push(`target: ${fx.target}`);
      if ( fx.target === "speed" ) {
        if ( !/^(?:half|zero|[+-]\d+)$/.test(String(fx.value)) ) errors.push(`value: ${fx.value}`);
      } else if ( !MODIFIER_VALUE.test(String(fx.value)) ) errors.push(`value: ${fx.value}`);
      errors.push(...validateUses(fx));
      if ( fx.scope && !["melee", "ranged", "all"].includes(fx.scope) ) errors.push(`scope: ${fx.scope}`);
      if ( (fx.oneShot ?? null) !== null && !ONE_SHOTS.includes(fx.oneShot) ) errors.push(`oneShot: ${fx.oneShot}`);
      errors.push(...validateDuration(fx.duration));
      break;
    case "roll":
      errors.push(...validateRollRule(fx));
      break;
    case "tick":
      errors.push(...validateTick(fx));
      break;
    default:
      errors.push(`type: ${type}`);
  }
  return errors;
}

/** Проверяет число использований (по умолчанию одно). */
function validateUses(fx) {
  if ( (fx.uses !== undefined) && !(Number.isInteger(fx.uses) && (fx.uses >= 1)) ) return [`uses: ${fx.uses}`];
  return [];
}

/**
 * Проверяет правило броска: `rule`, `rolls`, `scope`, `abilities`, `against`, `sameTarget`, `uses`, `duration`.
 * @param {object} fx
 * @returns {string[]}
 */
function validateRollRule(fx) {
  const errors = [];
  if ( !ROLL_RULES.includes(fx.rule) ) errors.push(`rule: ${fx.rule}`);
  const damage = DAMAGE_RULES.includes(fx.rule);
  if ( damage ) {
    if ( fx.rolls !== undefined ) errors.push("rolls: у правил урона не задаётся");
  } else if ( !Array.isArray(fx.rolls) || !fx.rolls.length || !fx.rolls.every(kind => ROLL_KINDS.includes(kind)) ) {
    errors.push(`rolls: ${JSON.stringify(fx.rolls)}`);
  }
  if ( fx.scope && !["melee", "ranged", "all"].includes(fx.scope) ) errors.push(`scope: ${fx.scope}`);
  if ( fx.scope && !damage && !fx.rolls?.includes("attack") ) errors.push("scope: только для атак");
  if ( fx.abilities !== undefined ) {
    if ( !Array.isArray(fx.abilities) || !fx.abilities.length || !fx.abilities.every(id => ABILITIES.includes(id)) ) {
      errors.push(`abilities: ${JSON.stringify(fx.abilities)}`);
    }
  }
  const attackOnly = !damage && (fx.rolls?.length === 1) && (fx.rolls[0] === "attack");
  if ( fx.against && !attackOnly ) errors.push("against: только для атак");
  if ( fx.sameTarget && !attackOnly ) errors.push("sameTarget: только для атак");
  if ( fx.against && fx.sameTarget ) errors.push("against и sameTarget несовместимы");
  errors.push(...validateUses(fx));
  errors.push(...validateDuration(fx.duration));
  return errors;
}

/**
 * Проверяет эффект «в начале или в конце хода»: урон по ходам и/или спасбросок с состоянием при провале.
 * @param {object} fx
 * @returns {string[]}
 */
function validateTick(fx) {
  const errors = [];
  if ( !["start", "end"].includes(fx.at) ) errors.push(`at: ${fx.at}`);
  const hasDamage = fx.damage !== undefined;
  const hasSave = fx.save !== undefined;
  if ( !hasDamage && !hasSave ) errors.push("нужен damage или save");
  if ( hasDamage ) {
    if ( !(FORMULA.test(String(fx.damage)) || (fx.damage === "quarterMax")) ) errors.push(`damage: ${fx.damage}`);
    if ( (fx.damageType ?? null) !== null && !DAMAGE_TYPES.includes(fx.damageType) ) errors.push(`damageType: ${fx.damageType}`);
  }
  if ( hasSave ) {
    if ( !ABILITIES.includes(fx.save?.ability) ) errors.push(`save.ability: ${fx.save?.ability}`);
    if ( !(Number.isInteger(fx.save?.dc) && (fx.save.dc > 0)) ) errors.push(`save.dc: ${fx.save?.dc}`);
    if ( !STATUSES.includes(fx.save?.fail) ) errors.push(`save.fail: ${fx.save?.fail}`);
  }
  errors.push(...validateUses(fx));
  errors.push(...validateDuration(fx.duration));
  return errors;
}

/**
 * Кто получает эффект в данном разделе.
 *
 * | Раздел            | «you»                 | «other»                |
 * | ----------------- | --------------------- | ---------------------- |
 * | промах            | бросавший             | цель атаки             |
 * | попадание Мастера | цель атаки (герой)    | бросавший (противник)  |
 * | попадание игрока  | бросавший (игрок)     | цель атаки             |
 *
 * @param {string} section
 * @param {"you"|"other"} who
 * @param {object} event       Событие: `actorUuid`, `targetUuids`.
 * @returns {string[]}         UUID акторов (может быть пустым, если цели неизвестны).
 */
export function resolveTargets(section, who, event) {
  const roller = event?.actorUuid ? [event.actorUuid] : [];
  const targets = event?.targetUuids ?? [];
  if ( section === SECTIONS.HIT_GM ) return (who === "you") ? targets : roller;
  return (who === "you") ? roller : targets;
}

/**
 * Во что превращается длительность: число раундов или секунд, либо ожидание отдыха.
 * Формулы кубиков (например, `1d4`) вычисляет вызывающий код.
 * @param {object} [duration]
 * @returns {{unit: "rounds"|"seconds"|"rest"|null, formula?: string, factor?: number, rest?: string}}
 */
export function durationPlan(duration) {
  switch ( duration?.type ) {
    case "rounds": return { unit: "rounds", formula: String(duration.value), factor: 1 };
    case "turnEnd": return { unit: "rounds", formula: "1", factor: 1 };
    case "minutes": return { unit: "rounds", formula: String(duration.value), factor: 10 };
    case "hours": return { unit: "seconds", formula: String(duration.value), factor: 3600 };
    case "days": return { unit: "seconds", formula: String(duration.value), factor: 86400 };
    case "rest": return { unit: "rest", rest: duration.rest };
    default: return { unit: null };
  }
}

/**
 * Изменения эффекта актора для числового модификатора.
 * Значения вида «-1d4» остаются формулами там, где dnd5e бросает их при каждом броске;
 * КД и скорость принимают только числа, поэтому для них формулу вычисляет вызывающий код.
 * @param {object} fx                 Разметка `modifier`.
 * @param {number|null} [resolved]    Вычисленное число (для КД и скорости).
 * @returns {{key: string, mode: number, value: string}[]}  `mode`: 2 — ADD, 1 — MULTIPLY, 5 — OVERRIDE.
 */
export function modifierChanges(fx, resolved=null) {
  const ADD = 2;
  const MULTIPLY = 1;
  const OVERRIDE = 5;
  const attackKinds = { melee: ["mwak", "msak"], ranged: ["rwak", "rsak"], all: ["mwak", "rwak", "msak", "rsak"] };
  const kinds = attackKinds[fx.scope ?? "all"];

  switch ( fx.target ) {
    case "ac":
      return [{ key: "system.attributes.ac.bonus", mode: ADD, value: String(resolved ?? fx.value) }];
    case "speed":
      if ( fx.value === "half" ) return [{ key: "system.attributes.movement.walk", mode: MULTIPLY, value: "0.5" }];
      if ( fx.value === "zero" ) return [{ key: "system.attributes.movement.walk", mode: OVERRIDE, value: "0" }];
      return [{ key: "system.attributes.movement.walk", mode: ADD, value: String(resolved ?? fx.value) }];
    case "attack":
      return kinds.map(kind => ({ key: `system.bonuses.${kind}.attack`, mode: ADD, value: fx.value }));
    case "damage":
      return kinds.map(kind => ({ key: `system.bonuses.${kind}.damage`, mode: ADD, value: fx.value }));
    case "save":
      return [{ key: "system.bonuses.abilities.save", mode: ADD, value: fx.value }];
    case "check":
      return [{ key: "system.bonuses.abilities.check", mode: ADD, value: fx.value }];
    case "skill":
      return [{ key: "system.bonuses.abilities.skill", mode: ADD, value: fx.value }];
    default:
      return [];
  }
}

/**
 * На каком типе броска снимается одноразовый модификатор. Модификатор урона от атаки живёт до броска урона,
 * поэтому он снимается на броске урона, а не атаки.
 * @param {object} fx
 * @returns {"attack"|"damage"|"save"|"check"|"skill"|null}
 */
export function consumeOn(fx) {
  if ( !fx.oneShot ) return null;
  return (fx.target === "damage") ? "damage" : fx.oneShot;
}

/** Правила множителей критического эффекта: на сколько умножается итог и берутся ли кубики на максимум. */
const CRIT_RULES = Object.freeze({
  double: { factor: 2, maximize: false },
  triple: { factor: 3, maximize: false },
  quadruple: { factor: 4, maximize: false },
  quintuple: { factor: 5, maximize: false },
  max: { factor: 1, maximize: true },
  maxPlus: { factor: 1, maximize: true, extraRoll: true },
  maxDouble: { factor: 2, maximize: true },
  maxTriple: { factor: 3, maximize: true },
  maxQuadruple: { factor: 4, maximize: true }
});

/**
 * Как нужно изменить бросок урона атаки, чтобы выполнить множитель критического эффекта.
 *
 * Эффект заменяет обычное удвоение кубиков критом dnd5e, а не складывается с ним. Урон берётся от исходной
 * формулы (4d10, а не 8d10):
 * - «двойной», «тройной», «четверной»: урон бросается и весь итог умножается на 2, 3, 4;
 * - «максимальный»: все кубики исходного урона на максимум (4d10 → 40);
 * - «максимальный двойной» и т.д.: максимальный урон умножается на 2, 3, 4;
 * - «максимальный и ещё бросок» (`maxPlus`): максимум, и ещё раз бросаются кубики урона (отдельным броском, `extraRoll`).
 *
 * @param {string} mode  Режим эффекта.
 * @returns {{factor: number, maximize: boolean, extraRoll?: boolean}|null}  `null` для неизвестного режима.
 */
export function critOperation(mode) {
  return CRIT_RULES[mode] ?? null;
}

/**
 * Собирает формулу из описания термов броска.
 * @param {({type: "dice", number: number, faces: number, modifiers?: string}|{type: "raw", formula: string})[]} terms
 * @param {object} [options]
 * @param {number} [options.factor=1]  Во сколько раз умножить итог формулы.
 * @returns {string}  Например `4d10 + 3` или `(4d10 + 3) * 2`.
 */
export function buildFormula(terms, { factor=1 }={}) {
  const base = terms.map(term => (term.type === "dice") ? `${term.number}d${term.faces}${term.modifiers ?? ""}` : term.formula)
    .join("").trim();
  return (factor > 1) ? `(${base}) * ${factor}` : base;
}

/**
 * Список эффектов, которые нужно наложить по решению на карточке.
 * Для разделов с вариантами (неудача и удача) эффекты применяются при использовании предмета, а не по решению на
 * карточке, поэтому для них список пустой.
 * @param {object} data
 * @param {string} data.section
 * @param {object} data.event
 * @param {object[]} [data.auto]  Разметка состояний выпавшего текста.
 * @param {object[]} [data.fx]    Разметка остальных эффектов выпавшего текста.
 * @returns {object[]}            `{ index, kind, ..., targets, applied, effectUuids }`.
 */
export function buildJobs({ section, event, auto, fx }) {
  if ( (section === SECTIONS.FUMBLE) || (section === SECTIONS.LUCK) ) return [];
  const jobs = [];
  for ( const item of auto ?? [] ) {
    jobs.push({ kind: "status", ...item, targets: resolveTargets(section, item.who, event) });
  }
  for ( const item of fx ?? [] ) {
    const job = { kind: item.type, ...item, when: item.when ?? "always" };
    delete job.type;
    job.targets = (item.type === "crit") ? [] : resolveTargets(section, item.who, event);
    if ( item.sameTarget ) job.onlyTargets = event?.targetUuids ?? [];
    if ( item.type === "crit" ) job.awaiting = true;
    jobs.push(job);
  }
  return jobs.map((job, index) => ({ ...job, index, applied: false, effectUuids: [] }));
}

/**
 * Накладывается ли эффект сам, без нажатия кнопки.
 * @param {object} job
 * @param {boolean} enabled  Настройка «применять эффекты автоматически».
 * @returns {boolean}
 */
export function isAutomatic(job, enabled) {
  if ( !enabled || (job.when !== "always") ) return false;
  return (job.kind === "crit") || (job.targets.length > 0);
}

/**
 * Эффекты, которые нельзя отменить: нанесённый урон, лечение и временные хиты.
 * При пересмотре решения они не применяются повторно.
 */
const IRREVERSIBLE_KINDS = Object.freeze(["damage", "heal", "tempHp"]);

/**
 * Список эффектов использованного предмета удачи или неудачи. Разметка берётся из данных модуля (не из запроса
 * игрока): «вы» — владелец предмета, «другой» — цели, выбранные игроком в момент использования.
 * Накладываются только безусловные эффекты, остальные остаются текстом; `crit` у предметов не бывает.
 * @param {object} data
 * @param {string} data.actorUuid
 * @param {string[]} data.targets
 * @param {object[]} [data.auto]
 * @param {object[]} [data.fx]
 * @returns {object[]}  Тот же формат, что у {@link buildJobs}; в список попадают только применимые эффекты.
 */
export function buildItemJobs({ actorUuid, targets, auto, fx }) {
  const jobs = [];
  for ( const item of auto ?? [] ) jobs.push({ kind: "status", ...item });
  for ( const item of fx ?? [] ) {
    if ( item.type === "crit" ) continue;
    const job = { kind: item.type, ...item };
    delete job.type;
    jobs.push(job);
  }
  return jobs
    .map((job, index) => {
      const resolved = { ...job, index, when: job.when ?? "always", targets: (job.who === "you") ? [actorUuid] : (targets ?? []) };
      if ( job.sameTarget ) resolved.onlyTargets = targets ?? [];
      return { ...resolved, applied: false, effectUuids: [] };
    })
    .filter(job => (job.when === "always") && job.targets.length);
}

/**
 * Какие из новых эффектов уже были применены раньше (и необратимы): их не нужно применять заново.
 * @param {object[]} jobs       Новый список эффектов (из {@link buildJobs}).
 * @param {number[]} [done]     Индексы необратимых эффектов, применённых по этому же результату ранее.
 * @returns {object[]}  Те же эффекты; уже применённые необратимые помечены `applied` и `keptIrreversible`.
 */
export function keepIrreversible(jobs, done=[]) {
  const kept = new Set(done ?? []);
  return jobs.map(job => (kept.has(job.index) && IRREVERSIBLE_KINDS.includes(job.kind))
    ? { ...job, applied: true, keptIrreversible: true }
    : job);
}

/**
 * Индексы необратимых эффектов, которые уже применены.
 * @param {object[]} jobs
 * @returns {number[]}
 */
export function irreversibleDone(jobs) {
  return (jobs ?? []).filter(job => job.applied && IRREVERSIBLE_KINDS.includes(job.kind)).map(job => job.index);
}

/**
 * Относится ли сообщение с уроном к атаке события (для множителей критического урона).
 * Надёжный признак — общий идентификатор использования (`flags.dnd5e.originatingMessage` у атаки и урона одной
 * активности). Без него годится урон того же персонажа тем же предметом, брошенный после атаки.
 * @param {object} event     Событие карточки (`actorUuid`, `itemUuid`, `usageMessageId`).
 * @param {object} damage    `{ type, actorUuid, itemUuid, originatingMessage, timestamp }`.
 * @param {number} since     Время сообщения атаки.
 * @returns {boolean}
 */
export function isDamageForEvent(event, damage, since) {
  if ( damage.type !== "damage" ) return false;
  if ( event.usageMessageId && damage.originatingMessage ) return damage.originatingMessage === event.usageMessageId;
  if ( !damage.actorUuid || (damage.actorUuid !== event.actorUuid) ) return false;
  if ( damage.timestamp < since ) return false;
  return !event.itemUuid || !damage.itemUuid || (damage.itemUuid === event.itemUuid);
}
