import { SECTIONS } from "./classify.mjs";

export const MODULE_ID = "critical-rolls";

/**
 * Описание всех настроек модуля одним списком (без Foundry, проверяется тестами).
 * От него зависят регистрация настроек, заголовки групп и проверка полноты подписей.
 *
 * Поля:
 * - `key`: ключ настройки (под ним значение хранится в мире);
 * - `kind`: `boolean` (флажок), `choice` (список) или `text` (строка; с `audio: true` — выбор звукового файла);
 * - `numeric`: значения списка числовые;
 * - `default`: значение по умолчанию;
 * - `group`: группа (заголовок в списке настроек);
 * - `choices`: `[{ value, label }]`, где `label` — ключ локализации.
 */

/**
 * Группы настроек в порядке показа: в списке настроек модуля их отделяют заголовки.
 * Подписи: `CRITROLLS.Settings.Group.<id>.Title` и `.Hint`.
 */
export const SETTING_GROUPS = Object.freeze(["sections", "decisions", "rules", "signals", "tracked", "tables", "service"]);

const MODE_CHOICES = [
  { value: "off", label: "CRITROLLS.Settings.mode.Off" },
  { value: "confirm", label: "CRITROLLS.Settings.mode.Confirm" },
  { value: "auto", label: "CRITROLLS.Settings.mode.Auto" }
];

const sections = Object.values(SECTIONS);

export const SETTING_DEFS = Object.freeze([
  // Разделы: выключен, подтверждение или авто.
  ...sections.map(section => ({
    key: `mode.${section}`, kind: "choice", default: "confirm", group: "sections", choices: MODE_CHOICES
  })),

  // Кто решает и как всё показывается.
  { key: "playerParticipates", kind: "boolean", default: false, group: "decisions" },
  { key: "showDialog", kind: "boolean", default: true, group: "decisions" },
  { key: "applyEffects", kind: "boolean", default: true, group: "decisions" },
  {
    key: "cardVisibility", kind: "choice", default: "all", group: "decisions",
    choices: [
      { value: "all", label: "CRITROLLS.Settings.cardVisibility.All" },
      { value: "gm", label: "CRITROLLS.Settings.cardVisibility.GM" },
      { value: "owner", label: "CRITROLLS.Settings.cardVisibility.Owner" }
    ]
  },

  // Правила.
  {
    key: "critRule", kind: "choice", default: "dnd5e", group: "rules",
    choices: [
      { value: "dnd5e", label: "CRITROLLS.Settings.critRule.Dnd5e" },
      { value: "20", label: "CRITROLLS.Settings.critRule.Only20" }
    ]
  },
  {
    key: "missLimit", kind: "choice", default: "round", group: "rules",
    choices: [
      { value: "combat", label: "CRITROLLS.Settings.missLimit.Combat" },
      { value: "round", label: "CRITROLLS.Settings.missLimit.Round" },
      { value: "any", label: "CRITROLLS.Settings.missLimit.Any" }
    ]
  },
  {
    key: "ceilingMode", kind: "choice", default: "party", group: "rules",
    choices: [
      { value: "party", label: "CRITROLLS.Settings.ceilingMode.Party" },
      { value: "partyMax", label: "CRITROLLS.Settings.ceilingMode.PartyMax" },
      { value: "none", label: "CRITROLLS.Settings.ceilingMode.None" }
    ]
  },
  {
    key: "duplicatePolicy", kind: "choice", default: "replace", group: "rules",
    choices: [
      { value: "replace", label: "CRITROLLS.Settings.duplicatePolicy.Replace" },
      { value: "keep", label: "CRITROLLS.Settings.duplicatePolicy.Keep" }
    ]
  },

  // Звук и подсветка токена при 1 и 20.
  { key: "soundEnabled", kind: "boolean", default: true, group: "signals" },
  { key: "soundCrit", kind: "text", default: "sounds/drums.wav", group: "signals", audio: true },
  { key: "soundFumble", kind: "text", default: "sounds/lock.wav", group: "signals", audio: true },
  { key: "pingEnabled", kind: "boolean", default: true, group: "signals" },

  // Какие броски вообще учитывать.
  { key: "trackAttacks", kind: "boolean", default: false, group: "tracked" },
  { key: "trackChecks", kind: "boolean", default: true, group: "tracked" },
  { key: "trackSaves", kind: "boolean", default: true, group: "tracked" },
  { key: "trackDeathSaves", kind: "boolean", default: false, group: "tracked" },
  { key: "trackInitiative", kind: "boolean", default: false, group: "tracked" },
  { key: "trackFreeRolls", kind: "boolean", default: false, group: "tracked" },

  // Таблицы в боковой панели.
  { key: "autoTables", kind: "boolean", default: true, group: "tables" },

  // Служебное.
  { key: "debug", kind: "boolean", default: false, group: "service" }
]);

/**
 * Путь к подписи настройки в файле локализации (без префикса `CRITROLLS.`).
 * У режима раздела подписи берутся у самого раздела.
 * @param {string} key
 * @returns {string}
 */
export function labelPath(key) {
  return key.startsWith("mode.") ? `Settings.section.${key.slice("mode.".length)}` : `Settings.${key}`;
}
