import { MODULE_ID } from "./settings-defs.mjs";
import { canAct, canRevise, requestAction } from "./actions.mjs";
import { isVariantSection } from "./tables.mjs";
import { wantsDialog } from "./card-state.mjs";
import { participantActors } from "./helpers.mjs";

/** Открытые окна решения по идентификатору сообщения. */
const openDialogs = new Map();

/** Класс окна создаётся при первом использовании: `dnd5e` к моменту загрузки модуля может быть ещё не готов. */
let DecisionDialog;

/**
 * Флаги модуля у сообщения.
 * @param {string} messageId
 * @returns {object|undefined}
 */
function flagsOf(messageId) {
  return game.messages.get(messageId)?.flags?.[MODULE_ID];
}

/**
 * Создаёт класс окна на основе диалога dnd5e (те же рамка, секции и кнопка в футере).
 * @returns {typeof foundry.applications.api.ApplicationV2}
 */
function createDialogClass() {
  const { Dialog5e } = dnd5e.applications.api;

  return class CriticalRollsDecisionDialog extends Dialog5e {
    /** @override */
    static DEFAULT_OPTIONS = {
      classes: ["critical-rolls-dialog"],
      messageId: null,
      mode: "decide",
      window: { icon: "fa-solid fa-dice-d20" },
      actions: {
        confirm: CriticalRollsDecisionDialog.onConfirm,
        reroll: CriticalRollsDecisionDialog.onReroll,
        decline: CriticalRollsDecisionDialog.onDecline
      },
      position: { width: 420 }
    };

    /** @override */
    static PARTS = {
      content: { template: `modules/${MODULE_ID}/templates/decision.hbs` },
      footer: { template: "templates/generic/form-footer.hbs" }
    };

    /** @override */
    get title() {
      const section = flagsOf(this.options.messageId)?.section;
      return section ? game.i18n.localize(`CRITROLLS.Section.${section}`) : game.i18n.localize("CRITROLLS.Title");
    }

    /** @override */
    get subtitle() {
      return flagsOf(this.options.messageId)?.event?.actorName ?? "";
    }

    /** @inheritDoc */
    async _prepareContentContext(context, options) {
      context = await super._prepareContentContext(context, options);
      const flags = flagsOf(this.options.messageId);
      if ( !flags ) return context;

      const { section, result, state } = flags;
      const choices = [];
      if ( isVariantSection(section) ) {
        const current = (state.status === "applied") ? state.choice : 0;
        result.variants.forEach((text, i) => choices.push({ value: i, label: text, checked: i === current }));
        if ( result.variants.length > 1 ) {
          choices.push({
            value: "both",
            label: game.i18n.localize("CRITROLLS.Dialog.Both"),
            checked: current === "both"
          });
          context.hint = game.i18n.localize("CRITROLLS.Dialog.BothHint");
        }
      } else {
        choices.push({ value: "apply", label: result.variants[0] ?? "", checked: true, single: true });
      }

      context.choices = choices;
      return context;
    }

    /** @inheritDoc */
    async _prepareFooterContext(context, options) {
      const section = flagsOf(this.options.messageId)?.section;
      context.buttons = [
        {
          action: "confirm",
          icon: "fa-solid fa-check",
          label: (section && isVariantSection(section)) ? "CRITROLLS.Dialog.Choose" : "CRITROLLS.Button.apply",
          type: "button"
        },
        { action: "reroll", icon: "fa-solid fa-dice", label: "CRITROLLS.Button.reroll", type: "button" },
        { action: "decline", icon: "fa-solid fa-xmark", label: "CRITROLLS.Button.decline", type: "button" }
      ];
      return context;
    }

    /** @inheritDoc */
    _onClose(options) {
      super._onClose(options);
      openDialogs.delete(this.options.messageId);
    }

    /**
     * Принять выбранный вариант (или применить эффект раздела без вариантов).
     * @this {CriticalRollsDecisionDialog}
     */
    static onConfirm() {
      const { messageId } = this.options;
      const flags = flagsOf(messageId);
      if ( flags ) {
        if ( isVariantSection(flags.section) ) {
          const value = this.element.querySelector("input[name=\"choice\"]:checked")?.value ?? "0";
          requestAction(messageId, "choose", value);
        } else {
          requestAction(messageId, "apply");
        }
      }
      this.close();
    }

    /**
     * Перебросить таблицу. Окно останется открытым и обновится, когда придёт новый результат.
     * Если Мастера нет в сети, запрос никуда не уходит и кнопки включаются обратно.
     * @this {CriticalRollsDecisionDialog}
     */
    static onReroll() {
      const buttons = Array.from(this.element.querySelectorAll("button"));
      buttons.forEach(button => button.disabled = true);
      if ( !requestAction(this.options.messageId, "reroll") ) buttons.forEach(button => button.disabled = false);
    }

    /**
     * Отказаться от эффекта.
     * @this {CriticalRollsDecisionDialog}
     */
    static onDecline() {
      requestAction(this.options.messageId, "decline");
      this.close();
    }
  };
}

/**
 * Открывает окно решения для карточки (или выводит уже открытое на передний план).
 * @param {string} messageId
 * @param {"decide"|"revise"} [mode="decide"]  `revise`: Мастер меняет уже принятое решение.
 */
export function openDecisionDialog(messageId, mode="decide") {
  const existing = openDialogs.get(messageId);
  if ( existing ) return void existing.bringToFront();

  DecisionDialog ??= createDialogClass();
  const dialog = new DecisionDialog({ messageId, mode });
  openDialogs.set(messageId, dialog);
  dialog.render({ force: true });
}

/**
 * Нужно ли открыть окно решения этому клиенту.
 * @param {ChatMessage} message
 * @returns {boolean}
 */
function shouldOpen(message) {
  const flags = message.flags?.[MODULE_ID];
  if ( !flags?.state || !message.visible ) return false;

  // Владелец в сети: тот, чей персонаж бросил (у попаданий Мастера — чьего героя критнули).
  const actors = participantActors(flags);
  return wantsDialog({
    enabled: game.settings.get(MODULE_ID, "showDialog"),
    canAct: canAct(message, game.user),
    participates: game.settings.get(MODULE_ID, "playerParticipates"),
    isGM: game.user.isGM,
    isActiveGM: !!game.users.activeGM?.isSelf,
    ownerOnline: game.users.some(user => user.active && !user.isGM
      && actors.some(actor => actor.testUserPermission(user, "OWNER")))
  });
}

/** Подписывается на сообщения чата: открывает окно на новую карточку и синхронизирует с ней состояние. */
export function registerDialogHooks() {
  Hooks.on("createChatMessage", message => {
    if ( shouldOpen(message) ) openDecisionDialog(message.id);
  });

  // Окно «решения» закрывается, как только решение принято (кем угодно); окно «изменения» живёт, пока Мастер
  // может менять карточку. Если карточку перебросили и она снова ждёт решения, окно открывается у тех, кому положено.
  Hooks.on("updateChatMessage", (message, changes) => {
    const dialog = openDialogs.get(message.id);
    if ( dialog ) {
      const keep = canAct(message, game.user) || ((dialog.options.mode === "revise") && canRevise(message, game.user));
      return void (keep ? dialog.render() : dialog.close());
    }
    const status = changes.flags?.[MODULE_ID]?.state?.status;
    if ( (status === "pending") && shouldOpen(message) ) openDecisionDialog(message.id);
  });

  Hooks.on("deleteChatMessage", message => {
    openDialogs.get(message.id)?.close();
  });
}
