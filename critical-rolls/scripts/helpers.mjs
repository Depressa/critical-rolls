import { participantUuids } from "./card-state.mjs";

/**
 * Служебные функции, общие для нескольких модулей с кодом Foundry: пользователи, названия, эффекты, броски урона.
 */

/**
 * Идентификаторы всех Мастеров (для шёпота).
 * @returns {string[]}
 */
export function gmUserIds() {
  return game.users.filter(user => user.isGM).map(user => user.id);
}

/**
 * Локализованное название состояния dnd5e.
 * @param {string} status  Идентификатор состояния.
 * @returns {string}
 */
export function statusName(status) {
  const entry = CONFIG.statusEffects.find(s => s.id === status);
  return game.i18n.localize(entry?.name ?? status);
}

/**
 * Действует ли эффект сейчас: не выключен и не истёк.
 * @param {ActiveEffect} effect
 * @returns {boolean}
 */
export function isLive(effect) {
  return !effect.disabled && ((effect.duration?.remaining ?? Infinity) > 0);
}

/**
 * Акторы, чьи владельцы участвуют в решении по карточке (см. {@link participantUuids}).
 * @param {object} flags  Флаги карточки: `section`, `event`.
 * @returns {Actor[]}
 */
export function participantActors(flags) {
  return participantUuids(flags.section, flags.event)
    .map(uuid => {
      const document = fromUuidSync(uuid);
      return document?.actor ?? document;
    })
    .filter(actor => !!actor?.testUserPermission);
}

/**
 * Владеет ли пользователь хотя бы одним из акторов карточки.
 * @param {object} flags
 * @param {User} user
 * @returns {boolean}
 */
export function isParticipant(flags, user) {
  return participantActors(flags).some(actor => actor.testUserPermission(user, "OWNER"));
}

/**
 * Параметры нового броска урона на основе исходного: тип урона и свойства.
 * @param {DamageRoll} roll
 * @returns {object}
 */
function rollOptions(roll) {
  const { type, types, properties } = roll.options;
  return Object.fromEntries(Object.entries({ type, types, properties }).filter(([, value]) => value !== undefined));
}

/**
 * Новый бросок урона на основе исходного: та же дата и те же параметры, другая формула.
 * @param {DamageRoll} source
 * @param {string} formula
 * @param {object} [evaluateOptions]  Например `{ maximize: true }` или `{ minimize: true }`.
 * @returns {Promise<DamageRoll>}
 */
export async function rerollDamage(source, formula, evaluateOptions={}) {
  const roll = new CONFIG.Dice.DamageRoll(formula, source.data, rollOptions(source));
  await roll.evaluate(evaluateOptions);
  return roll;
}

/**
 * Тип урона броска (`null`, если не задан).
 * @param {DamageRoll} roll
 * @returns {string|null}
 */
export function damageTypeOf(roll) {
  return rollOptions(roll).type ?? null;
}

/**
 * Подписи и имена для текстов карточки (см. `CardTextApi` в card-text.mjs).
 * @returns {object}
 */
export function cardTextApi() {
  return {
    localize: key => game.i18n.localize(key),
    format: (key, data) => game.i18n.format(key, data),
    statusName,
    abilityName: id => CONFIG.DND5E.abilities[id]?.label ?? id,
    nameOf: uuid => fromUuidSync(uuid)?.name ?? null
  };
}
