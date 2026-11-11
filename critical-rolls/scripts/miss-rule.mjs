/**
 * Правило частоты эффекта критического промаха. В книге сказано, что персонаж или существо бросает эффект
 * только за первый критический промах в бою (если эффект не применился, бросаются следующие).
 * В модуле это настройка с тремя значениями (правило касается и игроков, и монстров):
 * - `combat`: раз за бой;
 * - `round`: раз за раунд (по умолчанию);
 * - `any`: любой критический промах бросает эффект.
 * Вне начатого боя ограничения нет. Чистая логика, без Foundry.
 */

const MISS_LIMITS = Object.freeze(["combat", "round", "any"]);

/**
 * Запись о том, что у бросавшего в бою применён эффект промаха (одна на карточку).
 * @typedef {object} MissRecord
 * @property {string} uuid              UUID актора.
 * @property {string|null} messageId    Карточка, по которой эффект применён (`null` у записей старого формата).
 * @property {number|null} round        Раунд боя, в котором эффект применён.
 */

/**
 * Приводит значение настройки к допустимому.
 * @param {string} value
 * @returns {"combat"|"round"|"any"}
 */
export function normalizeLimit(value) {
  return MISS_LIMITS.includes(value) ? value : "round";
}

/**
 * Есть ли у бросавшего запись, из-за которой эффект нужно пропустить.
 * @param {MissRecord[]} list
 * @param {string} actorUuid
 * @param {"combat"|"round"|"any"} limit
 * @param {number} round  Текущий раунд боя.
 * @returns {boolean}
 */
export function hasMissRecord(list, actorUuid, limit, round) {
  if ( limit === "any" ) return false;
  return (list ?? []).some(record => (record.uuid === actorUuid) && ((limit === "combat") || (record.round === round)));
}

/**
 * Нужно ли пропустить карточку критического промаха: идёт начатый бой и у бросавшего уже есть запись.
 * @param {object} data
 * @param {"combat"|"round"|"any"} data.limit
 * @param {boolean} data.inCombat       Идёт начатый бой.
 * @param {boolean} data.alreadyApplied Результат {@link hasMissRecord}.
 * @returns {boolean}
 */
export function shouldSkipMiss({ limit, inCombat, alreadyApplied }) {
  return (limit !== "any") && !!inCombat && !!alreadyApplied;
}

/**
 * Обновлённый список записей. У каждой карточки одна запись: вторая карточка промаха того же персонажа,
 * брошенная, пока первая ждала решения, не затирается отказом по первой. Запись без карточки (старый формат)
 * заменяется записью того же актора.
 * @param {MissRecord[]} list
 * @param {MissRecord} record  Запись карточки: `uuid`, `messageId`, `round`.
 * @param {boolean} present    Эффект сейчас применён (`true`) или отклонён и сброшен (`false`).
 * @returns {MissRecord[]}
 */
export function updateMissList(list, record, present) {
  const same = item => item.messageId ? (item.messageId === record.messageId) : (item.uuid === record.uuid);
  const without = (list ?? []).filter(item => !same(item));
  return present ? [...without, { uuid: record.uuid, messageId: record.messageId ?? null, round: record.round }] : without;
}

/**
 * Приводит прежние форматы записей (список UUID, записи без карточки) к текущему. Записи старого вида считаются
 * относящимися к любому раунду.
 * @param {(string|MissRecord)[]} list
 * @returns {MissRecord[]}
 */
export function normalizeList(list) {
  return (list ?? []).map(item => (typeof item === "string")
    ? { uuid: item, messageId: null, round: null }
    : { messageId: null, ...item });
}
