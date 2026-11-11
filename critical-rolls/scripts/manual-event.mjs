import { SECTIONS, sideOf } from "./classify.mjs";
import { columnsOf, isColumnSection } from "./tables.mjs";

/**
 * Событие для ручного броска таблицы: как будто выпала настоящая 1 или 20. Чистая логика, без Foundry.
 */

/** Какое значение кубика подразумевает раздел: 1 у промахов и неудачи, 20 у попаданий и удачи. */
const NATURAL = Object.freeze({
  [SECTIONS.MISS]: 1,
  [SECTIONS.FUMBLE]: 1,
  [SECTIONS.HIT_GM]: 20,
  [SECTIONS.HIT_PC]: 20,
  [SECTIONS.LUCK]: 20
});

/**
 * Колонка, подходящая разделу: переданная, если она есть у раздела, иначе первая. У разделов без колонок `null`.
 * @param {string} section
 * @param {string} [column]
 * @returns {string|null}
 */
export function pickColumn(section, column) {
  if ( !isColumnSection(section) ) return null;
  const columns = columnsOf(section);
  return columns.includes(column) ? column : columns[0];
}

/**
 * Событие для карточки, брошенной вручную.
 * @param {object} data
 * @param {string} data.section
 * @param {string} [data.column]
 * @param {{id: string, name: string, isGM: boolean}} data.user   Кто бросает.
 * @param {{uuid: string, name: string, type: string, disposition?: number}|null} [data.actor]
 * @param {{name: string, uuid?: string}[]} [data.targets]
 * @returns {object|null}  `null`, если раздел неизвестен.
 */
export function buildManualEvent({ section, column, user, actor = null, targets = [] }) {
  const natural = NATURAL[section];
  if ( !natural ) return null;
  const pickedColumn = pickColumn(section, column);
  return {
    messageId: null,
    userId: user.id,
    userName: user.name,
    userIsGM: !!user.isGM,
    actorUuid: actor?.uuid ?? null,
    actorName: actor?.name ?? null,
    tokenName: null,
    tokenUuid: null,
    side: actor ? sideOf(actor.type, actor.disposition) : "player",
    rollType: "manual",
    natural,
    ruleCrit: false,
    ruleFumble: false,
    total: natural,
    results: [{ value: natural, kept: true }],
    mode: "normal",
    itemUuid: null,
    itemName: null,
    activityName: null,
    targets: targets.map(target => target.name),
    targetUuids: targets.map(target => target.uuid).filter(Boolean),
    attackKind: (section === SECTIONS.MISS) ? pickedColumn : null,
    damageColumn: ((section === SECTIONS.HIT_GM) || (section === SECTIONS.HIT_PC)) ? pickedColumn : null
  };
}

/**
 * Шаблон команды `/cr` для чата Foundry (с лишними словами или без).
 * Foundry проверяет им текст сообщения без обрамляющих тегов абзаца.
 */
export const CRIT_COMMAND = /^\/cr(\s|$)/i;
