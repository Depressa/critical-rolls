import { MODULE_ID } from "./settings-defs.mjs";
import { ceilingTable, columnFor, diceForTable, isColumnSection, tableNumber, tierOf } from "./tables.mjs";

/**
 * Основы имён файлов данных по разделам (к ним добавляется `.<язык>.json`). Раздел без файла считается не внесённым.
 */
const DATA_BASES = Object.freeze({
  miss: "miss",
  hitGM: "hit-gm",
  hitPC: "hit-pc",
  fumble: "fumble",
  luck: "luck"
});

/** Язык данных, если для текущего языка Foundry файла нет (и для всех остальных языков). */
const FALLBACK_LANG = "ru";

/** Сколько раз перебрасывать, если выпала таблица выше потолка по уровню. */
const CEILING_REROLLS = 3;

/** Кеш загруженных файлов по языку и разделу: `"<язык>:<раздел>"` → промис данных. */
const cache = new Map();

/**
 * Язык файлов данных: английский, если Foundry работает на английском, иначе русский.
 * @returns {string}
 */
function dataLang() {
  return (game.i18n?.lang === "en") ? "en" : FALLBACK_LANG;
}

/**
 * Читает файл данных раздела на языке (один раз за сессию). Ошибка не кешируется.
 * @param {string} section
 * @param {string} lang
 * @returns {Promise<object>}
 */
function readSection(section, lang) {
  const key = `${lang}:${section}`;
  if ( !cache.has(key) ) {
    const url = foundry.utils.getRoute(`modules/${MODULE_ID}/data/${DATA_BASES[section]}.${lang}.json`);
    cache.set(key, fetch(url).then(response => {
      if ( !response.ok ) throw new Error(`${response.status} ${response.statusText}`);
      return response.json();
    }));
  }
  return cache.get(key).catch(err => {
    cache.delete(key);
    throw err;
  });
}

/**
 * Загружает данные раздела на языке Foundry (один раз за сессию). Если файла на этом языке нет, читается русский.
 * @param {string} section
 * @returns {Promise<object|null>}  `null`, если для раздела нет данных или файл не загрузился.
 */
export async function loadSection(section) {
  if ( !DATA_BASES[section] ) return null;
  const lang = dataLang();
  if ( lang !== FALLBACK_LANG ) {
    try {
      return await readSection(section, lang);
    } catch(err) {
      console.warn(`${MODULE_ID} | нет данных раздела ${section} на языке ${lang}, используется ${FALLBACK_LANG}`, err);
    }
  }
  try {
    return await readSection(section, FALLBACK_LANG);
  } catch(err) {
    console.error(`${MODULE_ID} | не удалось загрузить данные раздела ${section}`, err);
    return null;
  }
}

/**
 * Один бросок к10 и к6.
 * @returns {Promise<{d10: number, d6: number}>}
 */
async function rollDice() {
  const roll = await new Roll("1d10 + 1d6").evaluate();
  return { d10: roll.terms[0].total, d6: roll.terms[2].total };
}

/**
 * Бросает таблицу раздела и находит эффект.
 * @param {string} section
 * @param {object} [event]           Событие: из него берётся колонка (вид атаки или тип урона).
 * @param {object} [options]
 * @param {number|null} [options.level]  Уровень группы для потолка; `null` — без потолка.
 * @param {number|null} [options.table]  Заданный номер таблицы (1–60): кубики не бросаются, потолок не применяется.
 * @returns {Promise<{missing: boolean, reason?: string, d10?: number, d6?: number, table?: number,
 *   tier?: string|null, column?: string|null, variants: string[], auto?: object[][], fx?: object[][]}>}
 */
export async function rollTableResult(section, event, { level=null, table: forced=null }={}) {
  const data = await loadSection(section);
  if ( !data ) return { missing: true, reason: "data", variants: [] };

  const byColumn = isColumnSection(section);
  const column = columnFor(section, event);
  if ( byColumn && !column ) return { missing: true, reason: "column", variants: [] };

  let dice;
  let table;
  if ( Number.isInteger(forced) ) {
    table = forced;
    dice = diceForTable(forced);
  } else {
    const max = ceilingTable(data.tiers, level);
    dice = await rollDice();
    for ( let i = 0; (i < CEILING_REROLLS) && (tableNumber(dice.d10, dice.d6) > max); i++ ) dice = await rollDice();
    table = Math.min(tableNumber(dice.d10, dice.d6), max);
  }

  const entry = data.entries.find(e => e.table === table);
  const text = byColumn ? entry?.columns?.[column] : null;
  const variants = byColumn ? (text ? [text] : []) : (entry?.variants ?? []);
  // Разметка эффектов для каждого варианта (у разделов по колонкам вариант один).
  const markup = key => byColumn ? [entry?.[key]?.[column] ?? []] : variants.map((_, i) => entry?.[key]?.[i] ?? []);
  return {
    missing: !variants.length,
    reason: variants.length ? undefined : "entry",
    ...dice,
    table,
    tier: tierOf(data.tiers, table)?.label ?? null,
    column,
    variants,
    auto: markup("auto"),
    fx: markup("fx")
  };
}

/**
 * Разметка эффектов одного варианта таблицы (для предметов удачи и неудачи). Читается из данных модуля, а не из
 * запроса игрока, поэтому игрок не может подменить эффект.
 * @param {string} section
 * @param {number} table
 * @param {number} variantIndex
 * @returns {Promise<{auto: object[], fx: object[]}|null>}  `null`, если такого варианта нет.
 */
export async function variantMarkup(section, table, variantIndex) {
  if ( isColumnSection(section) ) return null;
  const data = await loadSection(section);
  const entry = data?.entries.find(e => e.table === table);
  if ( !entry?.variants?.[variantIndex] ) return null;
  return { auto: entry.auto?.[variantIndex] ?? [], fx: entry.fx?.[variantIndex] ?? [] };
}
