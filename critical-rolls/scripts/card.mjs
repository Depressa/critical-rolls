import { MODULE_ID } from "./settings-defs.mjs";
import { SECTIONS } from "./classify.mjs";
import { rollTableResult } from "./engine.mjs";
import { partyLevel } from "./party.mjs";
import { escapeHtml, linkify } from "./linkify.mjs";
import { syncDecision } from "./decision.mjs";
import { isVariantSection } from "./tables.mjs";
import { buttonsFor, initialState } from "./card-state.mjs";
import { jobView } from "./card-text.mjs";
import { cardTextApi, gmUserIds, participantActors } from "./helpers.mjs";

const TEMPLATE = `modules/${MODULE_ID}/templates/card.hbs`;

/**
 * Локализация с запасным значением, если ключа нет.
 * @param {string} key
 * @param {string} fallback
 * @returns {string}
 */
function localizeOr(key, fallback) {
  return game.i18n.has(key) ? game.i18n.localize(key) : fallback;
}

/**
 * Пользователи, которым адресована карточка (`null`, если она публичная).
 * @param {object} flags  Флаги карточки: `section`, `event`.
 * @returns {string[]|null}
 */
function whisperFor(flags) {
  // Скрытый бросок раскрывать нельзя: карточку видит только Мастер.
  if ( flags.event.hidden ) return gmUserIds();
  const mode = game.settings.get(MODULE_ID, "cardVisibility");
  if ( mode === "all" ) return null;
  // «Владелец»: чей персонаж бросил, а для попаданий Мастера — чьего героя критнули.
  const actors = (mode === "owner") ? participantActors(flags) : [];
  const users = game.users.filter(user => user.isGM || actors.some(actor => actor.testUserPermission(user, "OWNER")));
  return users.map(user => user.id);
}

/**
 * Строки с описанием события: кто, чем и по кому бросил.
 * @param {object} event
 * @param {string} section
 * @returns {{label: string, value: string}[]}
 */
function eventRows(event, section) {
  const t = key => game.i18n.localize(`CRITROLLS.${key}`);
  const rows = [];

  const who = event.userIsGM ? `${event.userName} (${t("Card.GM")})` : event.userName;
  rows.push({ label: t("Card.User"), value: who });

  if ( event.actorName ) {
    const token = (event.tokenName && (event.tokenName !== event.actorName)) ? ` (${event.tokenName})` : "";
    rows.push({ label: t("Card.Actor"), value: `${event.actorName}${token}` });
  }
  rows.push({ label: t("Card.Side"), value: t(`Side.${event.side}`) });

  const rollType = localizeOr(`CRITROLLS.RollType.${event.rollType}`, t("RollType.other"));
  const activity = (event.activityName !== rollType) ? event.activityName : null;
  const source = [event.itemName, activity].filter(Boolean).join(" — ");
  rows.push({ label: t("Card.Roll"), value: source ? `${rollType}: ${source}` : rollType });

  if ( event.targets.length ) rows.push({ label: t("Card.Targets"), value: event.targets.join(", ") });

  if ( section === SECTIONS.MISS && event.attackKind ) {
    rows.push({ label: t("Card.AttackKind"), value: t(`AttackKind.${event.attackKind}`) });
  } else if ( (section === SECTIONS.HIT_GM) || (section === SECTIONS.HIT_PC) ) {
    rows.push({ label: t("Card.DamageColumn"), value: t(`DamageColumn.${event.damageColumn ?? "unknown"}`) });
  }
  return rows;
}

/**
 * Подпись состояния карточки.
 * @param {object} state
 * @param {string} section
 * @returns {string|null}
 */
function statusText(state, section) {
  const t = key => game.i18n.localize(`CRITROLLS.${key}`);
  if ( state.status === "declined" ) return t("Status.declined");
  if ( state.status !== "applied" ) return null;
  if ( !isVariantSection(section) ) return t("Status.applied");
  if ( state.choice === "both" ) return t("Status.both");
  return game.i18n.format("CRITROLLS.Status.variant", { n: state.choice + 1 });
}

/**
 * Подпись кнопки.
 * @param {{action: string, value?: (number|string)}} button
 * @returns {string}
 */
function buttonLabel({ action, value }) {
  if ( action === "choose" ) {
    return (value === "both")
      ? game.i18n.localize("CRITROLLS.Button.both")
      : game.i18n.format("CRITROLLS.Button.variant", { n: value + 1 });
  }
  return game.i18n.localize(`CRITROLLS.Button.${action}`);
}

/**
 * Данные для шаблона карточки по сохранённому состоянию.
 * @param {object} flags  Флаги модуля у сообщения: `section`, `event`, `result`, `state`.
 * @returns {object}
 */
function prepareContext({ section, event, result, state, itemUuid, itemName, itemNote, jobs }) {
  const t = key => game.i18n.localize(`CRITROLLS.${key}`);
  const api = cardTextApi();
  const itemLine = [
    itemUuid ? `${t("Item.Given")}: @UUID[${itemUuid}]{${escapeHtml(itemName ?? "")}}` : null,
    (itemNote === "replaced") ? t("Item.Replaced") : null,
    (itemNote === "kept") ? t("Item.Kept") : null,
    (itemNote === "used") ? t("Item.Used") : null,
    (itemNote === "failed") ? t("Item.Failed") : null
  ].filter(Boolean).join(". ");
  const context = {
    itemLine,
    kind: event.natural <= 10 ? "fail" : "crit",
    natural: event.natural,
    title: t(`Section.${section}`),
    rows: eventRows(event, section),
    dice: event.results,
    mode: event.mode === "normal" ? null : t(`Mode.${event.mode}`),
    total: event.total,
    labels: { dice: t("Card.Dice"), total: t("Card.Total"), missing: t(`Card.Missing.${result.reason ?? "data"}`) },
    missing: result.missing,
    result: null,
    statusText: statusText(state, section),
    jobs: (state.status === "applied") ? (jobs ?? []).map(job => jobView(job, api)) : [],
    buttons: []
  };
  if ( result.missing ) return context;

  const picked = variant => (state.choice === "both") || (state.choice === variant);
  context.result = {
    line: [
      result.tier,
      state.rerolls ? game.i18n.format("CRITROLLS.Result.Rerolls", { n: state.rerolls }) : null
    ].filter(Boolean).join(" · "),
    single: !isVariantSection(section),
    html: linkify(result.variants[0]),
    variants: result.variants.map((text, i) => ({
      html: linkify(text),
      chosen: (state.status === "applied") && picked(i),
      dimmed: (state.status === "applied") && !picked(i)
    }))
  };
  if ( state.status === "pending" ) {
    context.buttons = buttonsFor(section, result.variants.length).map(button => ({ ...button, label: buttonLabel(button) }));
  } else if ( (state.status === "applied") || (state.status === "declined") ) {
    context.buttons = [{ action: "revise", label: buttonLabel({ action: "revise" }) }];
  }
  return context;
}

/**
 * HTML карточки по сохранённому состоянию.
 * @param {object} flags
 * @returns {Promise<string>}
 */
export function renderContent(flags) {
  return foundry.applications.handlebars.renderTemplate(TEMPLATE, prepareContext(flags));
}

/**
 * Бросает таблицу раздела и публикует в чат карточку события.
 * Идентификатор сообщения выбирается заранее: эффекты и запись о промахе, наложенные сразу (режим «Авто»),
 * ссылаются на карточку, которой в этот момент ещё нет в чате.
 * @param {object} event
 * @param {string} section  Значение из {@link SECTIONS}.
 * @param {object} [options]
 * @param {number|null} [options.table]  Заданный номер таблицы вместо случайного (ручной бросок).
 * @returns {Promise<ChatMessage>}
 */
export async function postCard(event, section, { table = null } = {}) {
  const result = await rollTableResult(section, event, { level: partyLevel(), table });
  const state = initialState({
    auto: game.settings.get(MODULE_ID, `mode.${section}`) === "auto",
    section,
    variantCount: result.variants.length,
    missing: result.missing
  });
  const messageId = foundry.utils.randomID();
  const flags = await syncDecision({ section, event, result, state }, messageId);

  const data = {
    _id: messageId,
    content: await renderContent(flags),
    speaker: { alias: game.i18n.localize("CRITROLLS.Title") },
    flags: { [MODULE_ID]: flags }
  };
  const whisper = whisperFor(flags);
  if ( whisper ) data.whisper = whisper;
  return ChatMessage.create(data, { keepId: true });
}
