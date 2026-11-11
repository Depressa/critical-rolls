import { MODULE_ID } from "./settings-defs.mjs";
import { SECTIONS } from "./classify.mjs";
import { hasMissRecord, normalizeLimit, normalizeList, shouldSkipMiss, updateMissList } from "./miss-rule.mjs";
import { gmUserIds } from "./helpers.mjs";

const FLAG = "missLog";

/**
 * Начатый бой, в котором действует правило. Вне боя правило не применяется.
 * @returns {Combat|null}
 */
function activeCombat() {
  const combat = game.combat;
  return combat?.started ? combat : null;
}

/** @returns {"combat"|"round"|"any"} Частота эффекта промаха по настройке. */
function missLimit() {
  return normalizeLimit(game.settings.get(MODULE_ID, "missLimit"));
}

/**
 * Нужно ли пропустить карточку критического промаха: правило включено, идёт бой и у бросавшего уже есть эффект
 * (в этом бою или в этом раунде, как выбрано в настройке). Касается и игроков, и монстров.
 * @param {object} event
 * @returns {boolean}
 */
export function skipMiss(event) {
  const combat = activeCombat();
  const limit = missLimit();
  return shouldSkipMiss({
    limit,
    inCombat: !!combat,
    alreadyApplied: !!combat && !!event.actorUuid
      && hasMissRecord(normalizeList(combat.getFlag(MODULE_ID, FLAG)), event.actorUuid, limit, combat.round)
  });
}

/**
 * Запоминает в бою, что карточка промаха применена (или снята). Запись ведётся по карточке, а не по актору:
 * две карточки одного персонажа не затирают друг друга. Вызывается при любом изменении решения на карточке
 * промаха. Выполняется на клиенте ГМ.
 * @param {object} flags      Флаги карточки.
 * @param {string} messageId  Идентификатор карточки.
 * @returns {Promise<void>}
 */
export async function syncMissRecord(flags, messageId) {
  if ( (flags.section !== SECTIONS.MISS) || !flags.event?.actorUuid ) return;
  const combat = activeCombat();
  if ( !combat ) return;
  const list = normalizeList(combat.getFlag(MODULE_ID, FLAG));
  const record = { uuid: flags.event.actorUuid, messageId, round: combat.round };
  const next = updateMissList(list, record, flags.state.status === "applied");
  if ( JSON.stringify(next) !== JSON.stringify(list) ) await combat.setFlag(MODULE_ID, FLAG, next);
}

/**
 * Сообщение для Мастера: почему промах не дал эффекта.
 * @param {object} event
 * @returns {Promise<ChatMessage>}
 */
export function postSkipNote(event) {
  const name = event.actorName ?? event.userName;
  return ChatMessage.create({
    content: `<div class="critical-rolls-card fail"><p>${foundry.utils.escapeHTML(
      game.i18n.format(`CRITROLLS.MissRule.Skipped.${missLimit()}`, { name })
    )}</p></div>`,
    speaker: { alias: game.i18n.localize("CRITROLLS.Title") },
    whisper: gmUserIds()
  });
}
