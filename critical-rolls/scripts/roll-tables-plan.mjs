import { SECTIONS } from "./classify.mjs";
import { linkify } from "./linkify.mjs";
import { columnsOf, isColumnSection, tierOf } from "./tables.mjs";

/**
 * Состав таблиц для боковой панели «Таблицы». Чистая логика, без Foundry.
 * Из пяти разделов получается 14 таблиц 1d60: у промахов и попаданий по таблице на каждую колонку,
 * у неудачи и удачи по одной (с вариантами в тексте результата).
 */

/** Формула таблицы: равномерно 1–60, как к10 + к6 по номеру `(к10 − 1) × 6 + к6`. */
export const TABLE_FORMULA = "1d60";

/**
 * Простой хеш строки (djb2): по нему видно, изменилось ли содержимое таблицы.
 * @param {string} text
 * @returns {string}
 */
export function hashText(text) {
  let hash = 5381;
  for ( let i = 0; i < text.length; i++ ) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return hash.toString(16);
}

/**
 * Текст результата для записи данных.
 * @param {string} section
 * @param {object} entry
 * @param {string|null} column
 * @returns {string}  HTML со ссылками на спасброски и кубики; пустая строка, если текста нет.
 */
function resultHtml(section, entry, column) {
  if ( isColumnSection(section) ) {
    const text = entry?.columns?.[column];
    return text ? `<p>${linkify(text)}</p>` : "";
  }
  return (entry?.variants ?? []).map((text, i) => `<p><strong>${i + 1}.</strong> ${linkify(text)}</p>`).join("");
}

/**
 * Описание таблиц для создания в мире.
 * @param {Record<string, object>} datasets  Данные разделов по ключу раздела (как в файлах `data/*.ru.json`).
 * @param {object} names                     Подписи (локализация).
 * @param {function(string): string} names.section
 * @param {function(string, string): string} names.column
 * @param {function(number, string|null): string} names.result  Название результата по номеру и названию уровня риска.
 * @returns {{key: string, name: string, results: {range: number[], name: string, description: string}[],
 *   hash: string}[]}
 */
export function buildTableSpecs(datasets, names) {
  const specs = [];
  for ( const section of Object.values(SECTIONS) ) {
    const data = datasets[section];
    if ( !data ) continue;
    const columns = isColumnSection(section) ? columnsOf(section) : [null];
    for ( const column of columns ) {
      const results = [];
      for ( const entry of data.entries ) {
        const description = resultHtml(section, entry, column);
        if ( !description ) continue;
        const tier = tierOf(data.tiers, entry.table)?.label ?? null;
        results.push({ range: [entry.table, entry.table], name: names.result(entry.table, tier), description });
      }
      const name = column ? `${names.section(section)}: ${names.column(section, column)}` : names.section(section);
      const key = column ? `${section}:${column}` : section;
      specs.push({ key, name, results, hash: hashText(JSON.stringify({ name, results, layout: 2 })) });
    }
  }
  return specs;
}
