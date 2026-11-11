import { MODULE_ID } from "./settings-defs.mjs";
import { escapeHtml, linkify } from "./linkify.mjs";

/**
 * Сборка данных предмета удачи или неудачи. Не зависит от Foundry, поэтому проверяется обычными тестами.
 * Предмет расходуемый (dnd5e): одно использование, при расходе исчезает. Если выбор между вариантами отложен
 * («оставить оба»), у предмета по активности на каждый вариант, и dnd5e сам спрашивает, какую применить.
 */

/**
 * Идентификаторы активностей по порядку вариантов (16 латинских букв и цифр, как требует Foundry).
 * По использованной активности находится вариант предмета.
 */
export const ACTIVITY_IDS = Object.freeze(["crVariantOne0001", "crVariantTwo0002"]);

const ICONS = Object.freeze({
  luck: "icons/magic/control/buff-luck-fortune-clover-green.webp",
  fumble: "icons/magic/death/skull-humanoid-white-red.webp"
});

/** Предельная длина текста варианта в названии активности (его видно в окне выбора). */
const ACTIVITY_NAME_LENGTH = 110;

/**
 * Короткая выдержка из текста для названия предмета.
 * @param {string} text
 * @param {number} [max=40]
 * @returns {string}
 */
export function excerpt(text, max=40) {
  const clean = text.replace(/\s+/g, " ").trim().replace(/[.!]+$/, "");
  if ( clean.length <= max ) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1)).trimEnd()}…`;
}

/**
 * Данные предмета для `Item.create` (создаётся у владельца в виде встроенного документа).
 * @param {object} data
 * @param {"luck"|"fumble"} data.kind
 * @param {number} data.table                   Номер выпавшей таблицы.
 * @param {string[]} data.variants              Тексты вариантов эффекта.
 * @param {number|"both"} data.choice           Номер выбранного варианта (с нуля) или `both`.
 * @param {object} data.labels
 * @param {string} data.labels.kind             «Удача» или «Неудача».
 * @param {string} data.labels.deferred         «на выбор».
 * @param {string} data.labels.use              «Использовать».
 * @param {function(number): string} data.labels.variant  `n => "Вариант n"`.
 * @returns {object}
 */
export function buildItemData({ kind, table, variants, choice, labels, auto = [], fx = [] }) {
  const picked = (choice === "both") ? variants.map((_, i) => i) : [choice];
  const name = (picked.length > 1)
    ? `${labels.kind} (${labels.deferred})`
    : `${labels.kind}: ${excerpt(variants[picked[0]])}`;

  const activities = {};
  picked.forEach((index, order) => {
    const _id = ACTIVITY_IDS[order];
    activities[_id] = {
      _id,
      type: "utility",
      name: (picked.length > 1) ? excerpt(variants[index], ACTIVITY_NAME_LENGTH) : labels.use,
      img: ICONS[kind],
      sort: order * 100000,
      activation: { type: "special" },
      consumption: { targets: [{ type: "itemUses", target: "", value: "1" }] },
      description: { chatFlavor: escapeHtml(variants[index]) }
    };
  });

  const description = picked.map(index => (picked.length > 1)
    ? `<p><strong>${escapeHtml(labels.variant(index + 1))}.</strong> ${linkify(variants[index])}</p>`
    : `<p>${linkify(variants[index])}</p>`).join("");

  return {
    name,
    type: "consumable",
    img: ICONS[kind],
    system: {
      // Поле для чата нужно: без него dnd5e скрывает описание в карточке использования у Мастера.
      description: { value: description, chat: description },
      quantity: 1,
      weight: { value: 0, units: "lb" },
      type: { value: "trinket" },
      uses: { max: "1", spent: 0, recovery: [], autoDestroy: true },
      activities
    },
    // `picked`: какие варианты соответствуют активностям по порядку, `auto` и `fx` — разметка эффектов вариантов.
    flags: { [MODULE_ID]: { kind, table, variants, choice, picked, auto, fx } }
  };
}
