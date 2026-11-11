import { MODULE_ID, SETTING_DEFS, SETTING_GROUPS, labelPath } from "./settings-defs.mjs";
import { syncRollTables } from "./roll-tables.mjs";
import { rollTableManually } from "./manual.mjs";

/**
 * Кнопка в списке настроек, которая не открывает окно, а сразу выполняет действие.
 * Foundry требует, чтобы класс кнопки был приложением (ApplicationV2), создаёт его и вызывает `render`;
 * вместо окна запускаем действие.
 */
class ActionMenu extends foundry.applications.api.ApplicationV2 {
  /** @returns {Promise<void>} */
  async run() {}

  /** @returns {Promise<this>} */
  async render() {
    await this.run();
    return this;
  }
}

class SyncTablesMenu extends ActionMenu {
  async run() {
    await syncRollTables();
  }
}

class ManualRollMenu extends ActionMenu {
  async run() {
    await rollTableManually();
  }
}

/**
 * Регистрирует настройки мира. Все они лежат прямо в списке настроек модуля (Settings → Configure Settings →
 * Module Settings). Сверху две кнопки действий, ниже настройки по группам (заголовки добавляет
 * {@link addGroupHeadings}).
 */
export function registerSettings() {
  game.settings.registerMenu(MODULE_ID, "syncTables", {
    name: "CRITROLLS.Settings.Tools.SyncTablesName",
    label: "CRITROLLS.Settings.Tools.SyncTables",
    hint: "CRITROLLS.Settings.Tools.SyncTablesHint",
    icon: "fa-solid fa-rotate",
    type: SyncTablesMenu,
    restricted: true
  });
  game.settings.registerMenu(MODULE_ID, "manualRoll", {
    name: "CRITROLLS.Settings.Tools.ManualRollName",
    label: "CRITROLLS.Settings.Tools.ManualRoll",
    hint: "CRITROLLS.Settings.Tools.ManualRollHint",
    icon: "fa-solid fa-dice-d20",
    type: ManualRollMenu,
    restricted: true
  });

  for ( const def of SETTING_DEFS ) {
    const config = {
      name: `CRITROLLS.${labelPath(def.key)}.Name`,
      hint: `CRITROLLS.${labelPath(def.key)}.Hint`,
      scope: "world",
      config: true,
      default: def.default
    };
    if ( def.kind === "boolean" ) {
      config.type = Boolean;
    } else if ( def.kind === "choice" ) {
      config.type = def.numeric ? Number : String;
      config.choices = Object.fromEntries(def.choices.map(choice => [choice.value, choice.label]));
    } else {
      config.type = String;
      if ( def.audio ) config.filePicker = "audio";
    }
    game.settings.register(MODULE_ID, def.key, config);
  }
}

/** Разделы, от режима которых зависит группа выбора бросков. */
const LUCK_SECTIONS = ["luck", "fumble"];

/**
 * Показывает группу выбора бросков только тогда, когда включён хотя бы один из разделов удачи или неудачи.
 * @param {HTMLElement} root
 */
function syncTrackedVisibility(root) {
  const active = LUCK_SECTIONS.some(section => {
    const field = root.querySelector(`[name="${MODULE_ID}.mode.${section}"]`);
    return !!field && (field.value !== "off");
  });
  for ( const def of SETTING_DEFS.filter(item => item.group === "tracked") ) {
    const row = root.querySelector(`[name="${MODULE_ID}.${def.key}"]`)?.closest(".form-group");
    if ( !row ) continue;
    row.style.display = active ? "" : "none";
    const heading = row.previousElementSibling;
    if ( heading?.classList.contains("cr-settings-heading") ) heading.style.display = active ? "" : "none";
  }
}

/**
 * Следит за режимами разделов удачи и неудачи в открытом окне настроек: меняя режим, сразу видно группу бросков.
 * @param {HTMLElement} root
 */
function bindTrackedVisibility(root) {
  syncTrackedVisibility(root);
  for ( const section of LUCK_SECTIONS ) {
    root.querySelector(`[name="${MODULE_ID}.mode.${section}"]`)?.addEventListener("change", () => syncTrackedVisibility(root));
  }
}

/**
 * Добавляет в список настроек модуля заголовки групп (Foundry такого сам не умеет).
 * @param {Application} app
 * @param {HTMLElement} html
 */
export function addGroupHeadings(app, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if ( !root ) return;
  for ( const group of SETTING_GROUPS ) {
    const first = SETTING_DEFS.find(def => def.group === group);
    const field = first && root.querySelector(`[name="${MODULE_ID}.${first.key}"]`);
    const row = field?.closest(".form-group");
    if ( !row || row.previousElementSibling?.classList.contains("cr-settings-heading") ) continue;
    const heading = document.createElement("div");
    heading.className = "cr-settings-heading";
    const hint = game.i18n.localize(`CRITROLLS.Settings.Group.${group}.Hint`);
    heading.innerHTML = "<h3></h3>";
    heading.querySelector("h3").textContent = game.i18n.localize(`CRITROLLS.Settings.Group.${group}.Title`);
    // Пояснение может состоять из нескольких строк (разделитель — перевод строки): каждая идёт отдельным абзацем.
    for ( const line of hint.split("\n").filter(Boolean) ) {
      const paragraph = document.createElement("p");
      paragraph.className = "hint";
      paragraph.textContent = line;
      heading.append(paragraph);
    }
    row.before(heading);
  }
  bindTrackedVisibility(root);
}

/**
 * Включён ли раздел (режим не «выключен»).
 * @param {string} section  Значение из {@link SECTIONS}.
 * @returns {boolean}
 */
export function isSectionEnabled(section) {
  return game.settings.get(MODULE_ID, `mode.${section}`) !== "off";
}

/** Значения настроек, которые читает {@link isTrackedType}. */
export function trackingSettings() {
  return {
    trackAttacks: game.settings.get(MODULE_ID, "trackAttacks"),
    trackChecks: game.settings.get(MODULE_ID, "trackChecks"),
    trackSaves: game.settings.get(MODULE_ID, "trackSaves"),
    trackDeathSaves: game.settings.get(MODULE_ID, "trackDeathSaves"),
    trackInitiative: game.settings.get(MODULE_ID, "trackInitiative"),
    trackFreeRolls: game.settings.get(MODULE_ID, "trackFreeRolls")
  };
}
