import { MODULE_ID } from "./settings-defs.mjs";
import { addGroupHeadings, registerSettings, isSectionEnabled, trackingSettings } from "./settings.mjs";
import { SECTIONS, isTrackedType, sectionsFor, signalOf, trackedSections } from "./classify.mjs";
import { playSignal } from "./signals.mjs";
import { rollTableManually } from "./manual.mjs";
import { CRIT_COMMAND } from "./manual-event.mjs";
import { syncRollTables, syncRollTablesOnReady } from "./roll-tables.mjs";
import { postSkipNote, skipMiss } from "./miss-log.mjs";
import { extractEvent } from "./extract.mjs";
import { postCard } from "./card.mjs";
import { simulateRoll } from "./simulate.mjs";
import { bindButtons, canRevise, onDamageMessage, registerSocket, requestItemEffects } from "./actions.mjs";
import { consumeOneShots, itemEffectsPayload } from "./effects.mjs";
import { applyDamageRules, armDamageRules, registerRollRules } from "./roll-rules.mjs";
import { registerTicks } from "./ticks.mjs";
import { ACTIVITY_IDS } from "./item-data.mjs";
import { openDecisionDialog, registerDialogHooks } from "./dialog.mjs";

/**
 * Правило крита из настроек.
 * - `dnd5e`: у каждого своё: Чемпион и подобные получают порог 19 от самой системы, остальные только 20;
 * - `20`: чистая двадцатка у всех (включая монстров), пометки системы не учитываются.
 * @param {object} event
 * @returns {object}
 */
function critRange(event) {
  const rule = game.settings.get(MODULE_ID, "critRule");
  if ( rule === "dnd5e" ) return { critMin: 20, ruleCrit: event.ruleCrit, ruleFumble: event.ruleFumble };
  return { critMin: Number(rule), ruleCrit: false, ruleFumble: false };
}

/**
 * Разбирает новое сообщение чата и публикует карточки для подходящих разделов.
 * Работает только на клиенте активного ГМ, чтобы карточки не дублировались.
 * @param {ChatMessage} message
 */
async function onCreateChatMessage(message) {
  if ( !game.users.activeGM?.isSelf ) return;
  if ( message.flags?.[MODULE_ID] ) return;

  // Сначала снимаем одноразовые модификаторы, чтобы новый эффект не сняло тем же броском, который его вызвал.
  await consumeOneShots(message);
  await armDamageRules(message);
  await onDamageMessage(message);
  await applyDamageRules(message);

  const event = extractEvent(message);
  if ( !event ) return;
  // Атаки всегда дают промахи и попадания; удача и неудача зависят от настройки вида броска.
  const tracked = isTrackedType(event.rollType, trackingSettings());
  const attack = event.rollType === "attack";
  if ( !tracked && !attack ) return;

  const range = { ...event, ...critRange(event) };
  const signal = signalOf(range);
  if ( signal && (tracked || attack) ) playSignal(signal, event, message);

  const sections = trackedSections(sectionsFor(range).filter(isSectionEnabled), tracked);
  if ( game.settings.get(MODULE_ID, "debug") ) console.log(`${MODULE_ID} |`, event, sections);
  for ( const section of sections ) {
    // Правило книги: эффект критического промаха только за первый промах персонажа в бою.
    if ( (section === SECTIONS.MISS) && skipMiss(event) ) {
      await postSkipNote(event);
      continue;
    }
    await postCard(event, section);
  }
}

/**
 * Когда игрок использует предмет удачи или неудачи, выбранный вариант накладывает свои эффекты.
 * Хук срабатывает на клиенте того, кто использовал предмет; применяет эффекты Мастер (через сокет).
 * @param {Activity} activity
 */
function onUseActivity(activity) {
  const flags = activity.item?.flags?.[MODULE_ID];
  if ( !flags?.kind ) return;
  const order = ACTIVITY_IDS.indexOf(activity.id);
  const variantIndex = flags.picked?.[order];
  if ( !Number.isInteger(variantIndex) ) return;
  const payload = itemEffectsPayload(activity.item, variantIndex);
  if ( payload ) requestItemEffects(payload);
}

/**
 * Настройки и команда `/cr` в чате. Команда открывает то же окно, что и кнопка «Задать эффект вручную» (только
 * для Мастера); она регистрируется в списке команд чата Foundry, `false` не даёт отправить её текст в чат.
 */
Hooks.once("init", () => {
  registerSettings();
  foundry.applications.sidebar.tabs.ChatLog.CHAT_COMMANDS.cr = {
    rgx: CRIT_COMMAND,
    fn: () => {
      if ( game.user.isGM ) rollTableManually();
      else ui.notifications.warn(game.i18n.localize("CRITROLLS.Manual.GMOnly"));
      return false;
    }
  };
});

Hooks.on("renderSettingsConfig", addGroupHeadings);

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = { extractEvent, sectionsFor, simulateRoll, rollTableManually, syncRollTables };
  registerSocket();
  registerDialogHooks();
  registerRollRules();
  registerTicks();
  syncRollTablesOnReady();
});

/** Кнопка «Задать эффект вручную» в инструментах токенов (только Мастер). */
Hooks.on("getSceneControlButtons", controls => {
  const tools = controls.tokens?.tools;
  if ( !tools ) return;
  tools.criticalRolls = {
    name: "criticalRolls",
    title: "CRITROLLS.Manual.Tool",
    toolclip: { heading: "CRITROLLS.Manual.Tool", items: [{ paragraph: "CRITROLLS.Manual.ToolHint" }] },
    icon: "fa-solid fa-dice-d20",
    order: Object.keys(tools).length,
    button: true,
    visible: game.user.isGM,
    onChange: () => rollTableManually()
  };
});

Hooks.on("dnd5e.postUseActivity", onUseActivity);
Hooks.on("createChatMessage", onCreateChatMessage);
Hooks.on("renderChatMessageHTML", (message, html) => bindButtons(message, html, id => {
  const flagged = game.messages.get(id);
  if ( flagged && canRevise(flagged, game.user) ) openDecisionDialog(id, "revise");
}));
