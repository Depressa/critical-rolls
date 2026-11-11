import { SECTIONS } from "./classify.mjs";

/**
 * Чистая логика таблиц книги: номера, колонки, уровни риска. Не зависит от Foundry.
 * Состояние карточки (решения, кнопки, окно) лежит в card-state.mjs.
 */

/** Разделы, где в записи несколько вариантов и нужно выбирать между ними. */
const VARIANT_SECTIONS = new Set([SECTIONS.FUMBLE, SECTIONS.LUCK]);

/**
 * Номер таблицы по броскам к10 и к6.
 * @param {number} d10  1–10.
 * @param {number} d6   1–6.
 * @returns {number}    1–60.
 */
export function tableNumber(d10, d6) {
  return (d10 - 1) * 6 + d6;
}

/** Разделы, где эффект зависит от колонки: типа атаки (промахи) или типа урона (попадания). */
const COLUMN_SECTIONS = new Set([SECTIONS.MISS, SECTIONS.HIT_GM, SECTIONS.HIT_PC]);

/**
 * Зависит ли эффект раздела от колонки.
 * @param {string} section
 * @returns {boolean}
 */
export function isColumnSection(section) {
  return COLUMN_SECTIONS.has(section);
}

const DAMAGE_COLUMNS = ["slashing", "piercing", "bludgeoning", "magical"];

/** Колонки разделов в порядке книги. */
const COLUMNS = Object.freeze({
  [SECTIONS.MISS]: ["melee", "ranged", "natural", "magic"],
  [SECTIONS.HIT_GM]: DAMAGE_COLUMNS,
  [SECTIONS.HIT_PC]: DAMAGE_COLUMNS
});

/**
 * Колонки раздела: виды атаки у промахов, типы урона у попаданий; у остальных разделов пусто.
 * @param {string} section
 * @returns {string[]}
 */
export function columnsOf(section) {
  return COLUMNS[section] ?? [];
}

/**
 * Броски к10 и к6, которые дают заданный номер таблицы.
 * @param {number} table  1–60.
 * @returns {{d10: number, d6: number}}
 */
export function diceForTable(table) {
  return { d10: Math.ceil(table / 6), d6: ((table - 1) % 6) + 1 };
}

/**
 * Ключ колонки для события: вид атаки у промахов, тип урона у попаданий.
 * @param {string} section
 * @param {object} event
 * @returns {string|null}
 */
export function columnFor(section, event) {
  if ( section === SECTIONS.MISS ) return event?.attackKind ?? null;
  if ( (section === SECTIONS.HIT_GM) || (section === SECTIONS.HIT_PC) ) return event?.damageColumn ?? null;
  return null;
}

/**
 * Номер уровня риска (с нуля), открытый группе: 1+ первый, 5+ второй, 9+ третий, 13+ четвёртый.
 * @param {number|null} level  Уровень героев.
 * @returns {number|null}      `null`, если уровень неизвестен (потолок не применяется).
 */
export function levelTierIndex(level) {
  if ( !Number.isFinite(level) ) return null;
  if ( level >= 13 ) return 3;
  if ( level >= 9 ) return 2;
  return (level >= 5) ? 1 : 0;
}

/**
 * Наибольший допустимый номер таблицы для группы данного уровня.
 * @param {{to: number}[]} [tiers]  Уровни риска раздела по порядку.
 * @param {number|null} level
 * @returns {number}                60, если потолка нет.
 */
export function ceilingTable(tiers, level) {
  const index = levelTierIndex(level);
  if ( (index === null) || !tiers?.length ) return 60;
  return tiers[Math.min(index, tiers.length - 1)].to;
}

/**
 * Уровень риска, которому принадлежит таблица.
 * @param {{from: number, to: number}[]} [tiers]
 * @param {number} table
 * @returns {object|null}
 */
export function tierOf(tiers, table) {
  return tiers?.find(tier => (table >= tier.from) && (table <= tier.to)) ?? null;
}

/**
 * Нужно ли в разделе выбирать вариант эффекта.
 * @param {string} section
 * @returns {boolean}
 */
export function isVariantSection(section) {
  return VARIANT_SECTIONS.has(section);
}
