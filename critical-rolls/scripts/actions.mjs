import { MODULE_ID } from "./settings-defs.mjs";
import { renderContent } from "./card.mjs";
import { rollTableResult } from "./engine.mjs";
import { partyLevel } from "./party.mjs";
import { applyCardJob, applyItemEffects } from "./effects.mjs";
import { irreversibleDone } from "./effects-plan.mjs";
import { applyCritPlan, attachDamage, awaitsDamage, waitingCardFor } from "./crit.mjs";
import { syncDecision } from "./decision.mjs";
import { isVariantSection } from "./tables.mjs";
import { nextState, sameDecision } from "./card-state.mjs";
import { isParticipant } from "./helpers.mjs";

const SOCKET = `module.${MODULE_ID}`;

/** Очередь действий по карточке: два почти одновременных запроса выполняются по одному, а не оба сразу. */
const locks = new Map();

/**
 * Выполняет действие над карточкой после всех предыдущих действий над ней.
 * @param {string} messageId
 * @param {function(): Promise<*>} fn
 * @returns {Promise<*>}
 */
function withLock(messageId, fn) {
  const previous = locks.get(messageId) ?? Promise.resolve();
  const run = previous.then(fn);
  const chained = run.catch(err => console.error(`${MODULE_ID} |`, err));
  locks.set(messageId, chained);
  chained.then(() => {
    if ( locks.get(messageId) === chained ) locks.delete(messageId);
  });
  return run;
}

/**
 * Может ли пользователь решать судьбу карточки: ГМ всегда, владелец персонажа только при включённой настройке.
 * Для «Попаданий Мастера» владелец — тот, чьего героя критнули.
 * @param {ChatMessage} message
 * @param {User} user
 * @returns {boolean}
 */
export function canAct(message, user) {
  const flags = message.flags?.[MODULE_ID];
  if ( !flags?.state || (flags.state.status !== "pending") ) return false;
  if ( user.isGM ) return true;
  if ( !game.settings.get(MODULE_ID, "playerParticipates") ) return false;
  return isParticipant(flags, user);
}

/**
 * Может ли пользователь изменить уже принятое решение: только Мастер.
 * @param {ChatMessage} message
 * @param {User} user
 * @returns {boolean}
 */
export function canRevise(message, user) {
  const status = message.flags?.[MODULE_ID]?.state?.status;
  return user.isGM && ((status === "applied") || (status === "declined"));
}

/**
 * Применяет действие к карточке. Выполняется только на клиенте активного ГМ, по одному действию на карточку.
 * @param {string} messageId
 * @param {string} action     `apply`, `choose`, `decline`, `reroll` или `applyJob`.
 * @param {number|string} [value]
 * @param {string} userId     Кто нажал кнопку.
 * @returns {Promise<void>}
 */
function performAction(messageId, action, value, userId) {
  return withLock(messageId, () => doAction(messageId, action, value, userId));
}

/**
 * Само действие: права, новое состояние и всё, что из него следует. Флаги читаются здесь, а не раньше, чтобы
 * видеть результат предыдущего действия из очереди.
 * @param {string} messageId
 * @param {string} action
 * @param {number|string} [value]
 * @param {string} userId
 */
async function doAction(messageId, action, value, userId) {
  const message = game.messages.get(messageId);
  const user = game.users.get(userId);
  const flags = message?.flags?.[MODULE_ID];
  if ( !flags?.state || !user ) return;
  if ( action === "applyJob" ) return applyJobAction(message, flags, Number(value), user);
  const revise = flags.state.status !== "pending";
  if ( !(revise ? canRevise(message, user) : canAct(message, user)) ) return;

  const state = nextState(flags.state, action, {
    value,
    revise,
    variantCount: flags.result?.variants?.length ?? 0,
    isVariantSection: isVariantSection(flags.section)
  });
  if ( !state ) return;
  // Пересмотр, который ничего не меняет («Применить» на уже применённой карточке), не выполняется:
  // иначе урон и предметы применились бы второй раз.
  if ( revise && sameDecision(state, flags.state) ) return;

  let result = flags.result;
  const next = { ...flags, state };
  if ( action === "reroll" ) {
    const rerolled = await rollTableResult(flags.section, flags.event, { level: partyLevel() });
    if ( !rerolled.missing ) {
      result = rerolled;
      // Новая таблица: прежние необратимые эффекты к ней не относятся.
      next.doneIrreversible = [];
    }
  }

  const updated = await syncDecision({ ...next, result }, message.id);
  await message.update({ content: await renderContent(updated), flags: { [MODULE_ID]: updated } });
}

/**
 * Новое сообщение с уроном: если его ждёт карточка критического попадания, привязывает урон к ней.
 * Выполняется только на клиенте активного ГМ.
 * @param {ChatMessage} message
 * @returns {Promise<void>}
 */
export async function onDamageMessage(message) {
  const card = waitingCardFor(message);
  if ( !card ) return;
  await withLock(card.id, async () => {
    const flags = game.messages.get(card.id)?.flags?.[MODULE_ID];
    if ( !flags || !awaitsDamage(flags) ) return;
    const updated = await attachDamage(foundry.utils.deepClone(flags), message);
    await card.update({ content: await renderContent(updated), flags: { [MODULE_ID]: updated } });
  });
}

/**
 * Применяет один эффект карточки по кнопке (только Мастер): состояние, модификатор, урон, лечение
 * или дополнительный урон критического попадания.
 * @param {ChatMessage} message
 * @param {object} flags
 * @param {number} index
 * @param {User} user
 */
async function applyJobAction(message, flags, index, user) {
  if ( !user.isGM || (flags.state.status !== "applied") ) return;
  const job = flags.jobs?.[index];
  if ( !job || job.applied ) return;
  if ( (job.kind === "crit") && !job.plan?.length ) return;

  const applied = (job.kind === "crit") ? await applyCritPlan(job) : await applyCardJob(job, message);
  const jobs = flags.jobs.map((item, i) => (i === index) ? applied : item);
  const doneIrreversible = Array.from(new Set([...(flags.doneIrreversible ?? []), ...irreversibleDone(jobs)]));
  const updated = { ...flags, jobs, doneIrreversible };
  await message.update({ content: await renderContent(updated), flags: { [MODULE_ID]: updated } });
}

/**
 * Передаёт действие активному ГМ (или выполняет его сразу, если ГМ это мы).
 * @param {string} messageId
 * @param {string} action
 * @param {number|string} [value]
 * @returns {boolean}  `false`, если Мастера нет в сети и действие никуда не ушло.
 */
export function requestAction(messageId, action, value) {
  const gm = game.users.activeGM;
  if ( !gm ) {
    ui.notifications.warn(game.i18n.localize("CRITROLLS.NoGM"));
    return false;
  }
  if ( gm.isSelf ) performAction(messageId, action, value, game.user.id);
  else game.socket.emit(SOCKET, { messageId, action, value });
  return true;
}

/**
 * Передаёт Мастеру эффекты использованного предмета удачи или неудачи (или применяет сразу, если Мастер — мы).
 * @param {object} payload  Результат `itemEffectsPayload`.
 */
export function requestItemEffects(payload) {
  const gm = game.users.activeGM;
  if ( !gm ) return void ui.notifications.warn(game.i18n.localize("CRITROLLS.NoGM"));
  if ( gm.isSelf ) return void applyItemEffects(payload);
  game.socket.emit(SOCKET, { type: "itemUsed", payload });
}

/** Слушает запросы игроков. Отправителя берём из сокета, а не из содержимого сообщения. */
export function registerSocket() {
  game.socket.on(SOCKET, (data, senderId) => {
    if ( !game.users.activeGM?.isSelf ) return;
    if ( !senderId ) return void console.warn(`${MODULE_ID} | сокет не сообщил отправителя, запрос отклонён`);

    if ( data?.type === "itemUsed" ) {
      // Эффекты предмета принимаем, только если отправитель владеет персонажем, который его использовал.
      const actor = data.payload?.actorUuid ? fromUuidSync(data.payload.actorUuid) : null;
      const sender = game.users.get(senderId);
      if ( actor && sender && (sender.isGM || actor.testUserPermission(sender, "OWNER")) ) applyItemEffects(data.payload);
      return;
    }
    performAction(data?.messageId, data?.action, data?.value, senderId);
  });
}

/**
 * Подключает кнопки карточки. Тем, кто не может решать или менять решение, кнопки убираются.
 * Пока запрос в пути, кнопки выключены; если Мастера нет и запрос никуда не ушёл, они включаются обратно.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 * @param {function(string): void} onRevise  Открывает окно решения для уже решённой карточки (кнопка «Изменить»).
 */
export function bindButtons(message, html, onRevise) {
  const card = html.querySelector(".critical-rolls-card");
  if ( !card ) return;

  const actions = card.querySelector(".cr-actions");
  if ( actions && !canAct(message, game.user) && !canRevise(message, game.user) ) actions.remove();
  if ( !game.user.isGM ) card.querySelectorAll(".cr-jobs button").forEach(button => button.remove());

  card.addEventListener("click", event => {
    const button = event.target.closest("button[data-cr-action]");
    if ( !button ) return;
    const { crAction, crValue } = button.dataset;
    if ( crAction === "revise" ) return void onRevise(message.id);
    const buttons = (crAction === "applyJob") ? [button] : Array.from(button.closest(".cr-actions")?.querySelectorAll("button") ?? [button]);
    buttons.forEach(b => b.disabled = true);
    if ( !requestAction(message.id, crAction, crValue) ) buttons.forEach(b => b.disabled = false);
  });
}
