import { DAMAGE_RULES } from "./effects-plan.mjs";

/**
 * Чистая логика правил бросков: подходит ли правило (эффект на персонаже) к конкретному броску и каким получается
 * итоговый режим d20. Не зависит от Foundry.
 */

/**
 * Подходит ли правило к броску.
 * @param {object} rule                Сохранённое в эффекте правило: `rule`, `rolls`, `scope`, `abilities`,
 *                                     `against`, `onlyTargets`.
 * @param {object} context
 * @param {"attack"|"check"|"save"|"skill"|"tool"} context.kind  Вид броска (проверка инструмента считается проверкой).
 * @param {"melee"|"ranged"|null} [context.scope]  Рукопашная или дальнобойная атака.
 * @param {string} [context.ability]               Характеристика броска.
 * @param {boolean} [context.against=false]        Правило лежит на цели атаки, а не на бросающем.
 * @param {string[]} [context.targetUuids]         Цели атаки.
 * @returns {boolean}
 */
export function ruleMatches(rule, { kind, scope = null, ability, against = false, targetUuids = [] }) {
  if ( DAMAGE_RULES.includes(rule.rule) ) return false;
  if ( !!rule.against !== against ) return false;

  const kinds = rule.rolls ?? [];
  // Навыки и инструменты — тоже проверки характеристик; правило «навыки» не касается обычных проверок.
  const isCheck = ["check", "skill", "tool"].includes(kind);
  if ( !kinds.includes(kind) && !(isCheck && kinds.includes("check")) ) return false;

  if ( rule.scope && (rule.scope !== "all") ) {
    if ( kind !== "attack" ) return false;
    if ( scope !== rule.scope ) return false;
  }
  if ( rule.abilities?.length && !rule.abilities.includes(ability) ) return false;
  if ( rule.onlyTargets?.length && !targetUuids.some(uuid => rule.onlyTargets.includes(uuid)) ) return false;
  return true;
}

/**
 * Режим d20 по набору сработавших правил. Преимущество и помеха гасят друг друга, как в правилах 5e.
 * @param {string[]} rules  Значения `rule` сработавших правил.
 * @returns {{advantage: boolean, disadvantage: boolean}}  Что передать броску (броском же они взаимно гасятся).
 */
export function d20Flags(rules) {
  return { advantage: rules.includes("advantage"), disadvantage: rules.includes("disadvantage") };
}

/**
 * Подходит ли правило урона к атаке.
 * @param {object} rule
 * @param {"melee"|"ranged"|null} scope  Вид атаки, после которой бросается урон.
 * @returns {boolean}
 */
export function damageRuleMatches(rule, scope) {
  if ( !DAMAGE_RULES.includes(rule.rule) ) return false;
  if ( !rule.scope || (rule.scope === "all") ) return true;
  return rule.scope === scope;
}

/**
 * Как изменить бросок урона по набору сработавших правил: минимум важнее половины.
 * @param {string[]} rules  Значения `rule`.
 * @returns {"min"|"half"|null}
 */
export function damageChange(rules) {
  if ( rules.includes("minDamage") ) return "min";
  if ( rules.includes("halfDamage") ) return "half";
  return null;
}

/**
 * Формула урона после правила «половина».
 * @param {string} formula
 * @returns {string}  Округление вниз, как в правилах.
 */
export function halfFormula(formula) {
  return `floor((${formula}) / 2)`;
}

/**
 * Единственная таблица соответствия видов бросков: какие виды бросков модуля (`attack`, `damage`, `save`, `check`,
 * `skill`) представляет сообщение dnd5e каждого типа (`flags.dnd5e.roll.type`).
 * Проверка навыка — это и проверка характеристики, и навык: dnd5e добавляет к ней оба бонуса. Проверка
 * инструмента — только проверка характеристики (бонус навыков к ней не идёт).
 */
export const MESSAGE_ROLL_KINDS = Object.freeze({
  attack: Object.freeze(["attack"]),
  damage: Object.freeze(["damage"]),
  save: Object.freeze(["save"]),
  ability: Object.freeze(["check"]),
  skill: Object.freeze(["check", "skill"]),
  tool: Object.freeze(["check"])
});

/**
 * Виды бросков модуля, которые представляет сообщение dnd5e данного типа.
 * @param {string} [type]  Значение `flags.dnd5e.roll.type`.
 * @returns {string[]}     Пусто для неизвестного типа.
 */
export function rollKindsOf(type) {
  return MESSAGE_ROLL_KINDS[type] ?? [];
}

/**
 * Типы сообщений dnd5e, на которых тратится использование правила d20.
 * @param {string[]} rolls  Виды бросков правила.
 * @returns {string[]}      Значения `flags.dnd5e.roll.type`.
 */
export function consumeTypesFor(rolls) {
  const wanted = new Set(rolls ?? []);
  return Object.entries(MESSAGE_ROLL_KINDS)
    .filter(([, kinds]) => kinds.some(kind => wanted.has(kind)))
    .map(([type]) => type);
}

/** Вид броска d20 по названию хука dnd5e (в порядке проверки). */
const HOOK_KINDS = Object.freeze([
  ["attack", "attack"],
  ["SavingThrow", "save"],
  ["skill", "skill"],
  ["tool", "tool"],
  ["AbilityCheck", "check"],
  ["abilityCheck", "check"]
]);

/**
 * Вид броска d20 по названиям хуков dnd5e (`config.hookNames` в `dnd5e.preRoll`).
 * @param {string[]} [hookNames]
 * @returns {"attack"|"save"|"skill"|"tool"|"check"|null}  `null` для остальных бросков (урон, формулы).
 */
export function kindOfHooks(hookNames=[]) {
  return HOOK_KINDS.find(([hook]) => hookNames.includes(hook))?.[1] ?? null;
}

/**
 * Пошёл ли бой вперёд при смене хода. Шаг назад («Назад» в трекере боя) эффекты хода не запускает, иначе урон
 * в начале хода нанёсся бы дважды.
 * @param {{round: number, turn: number}|null} prior
 * @param {{round: number, turn: number}|null} current
 * @returns {boolean}
 */
export function turnAdvanced(prior, current) {
  if ( !current ) return false;
  if ( !prior ) return true;
  if ( (current.round ?? 0) !== (prior.round ?? 0) ) return (current.round ?? 0) > (prior.round ?? 0);
  return (current.turn ?? 0) > (prior.turn ?? 0);
}

/**
 * Формула урона эффекта «в начале или в конце хода».
 * @param {string} damage  Формула или `quarterMax` (четверть максимума хитов).
 * @returns {string}
 */
export function tickFormula(damage) {
  return (damage === "quarterMax") ? "floor(@attributes.hp.max / 4)" : String(damage);
}

/**
 * Применяется ли «заряженное» правило урона к этому броску урона: только к урону той же атаки
 * (общий `originatingMessage`). Урон без привязки (заклинание со спасброском, свободный бросок) не трогается.
 * @param {{modes: string[], origin: string|null}|string[]|null} pending  Запись на акторе (старый формат — список режимов).
 * @param {string|null} origin  `flags.dnd5e.originatingMessage` сообщения с уроном.
 * @returns {string[]}  Режимы, которые нужно применить (пусто, если не подходит).
 */
export function pendingModesFor(pending, origin) {
  if ( !pending ) return [];
  if ( Array.isArray(pending) ) return pending;
  if ( !pending.modes?.length ) return [];
  if ( pending.origin && origin && (pending.origin !== origin) ) return [];
  return pending.modes;
}
