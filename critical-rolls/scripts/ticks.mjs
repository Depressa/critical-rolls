import { MODULE_ID } from "./settings-defs.mjs";
import { changeExhaustion, spendUses } from "./effects.mjs";
import { tickFormula, turnAdvanced } from "./roll-rules-plan.mjs";
import { isLive, statusName } from "./helpers.mjs";

/**
 * Эффекты «в начале или в конце каждого вашего хода»: урон по ходам и спасбросок с состоянием при провале.
 * Срабатывают на смене хода в начатом бою; выполняет активный Мастер.
 */

/**
 * Наносит урон эффекта хода: бросок в чат и применение к актору.
 * @param {Actor} actor
 * @param {object} tick
 * @returns {Promise<void>}
 */
async function dealDamage(actor, tick) {
  const roll = await new Roll(tickFormula(tick.damage), actor.getRollData()).evaluate();
  const type = tick.damageType ? game.i18n.localize(`CRITROLLS.Fx.Damage.${tick.damageType}`) : "";
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.format(`CRITROLLS.Fx.Tick.${tick.at}Flavor`, { type }).replace(/\s+/g, " ").trim()
  });
  await actor.applyDamage([{ value: roll.total, ...(tick.damageType ? { type: tick.damageType } : {}) }]);
}

/**
 * Бросает спасбросок эффекта хода; при провале накладывает состояние до конца хода.
 * @param {Actor} actor
 * @param {object} save  `{ ability, dc, fail }`.
 * @returns {Promise<void>}
 */
async function rollSave(actor, save) {
  const [roll] = await actor.rollSavingThrow({ ability: save.ability, target: save.dc }, { configure: false }, {}) ?? [];
  if ( !roll || (roll.total >= save.dc) ) return;
  // Истощение не эффект, а уровень на акторе (см. `changeExhaustion`).
  if ( save.fail === "exhaustion" ) return void await changeExhaustion(actor, +1);
  const effect = await ActiveEffect.implementation.fromStatusEffect(save.fail);
  const data = effect?.toObject?.() ?? { statuses: [save.fail] };
  data.name = statusName(save.fail);
  data.duration = { ...(data.duration ?? {}), rounds: 1 };
  await actor.createEmbeddedDocuments("ActiveEffect", [data]);
}

/**
 * Срабатывают эффекты хода для актора: начало или конец его хода.
 * @param {Actor} actor
 * @param {"start"|"end"} at
 * @returns {Promise<void>}
 */
async function runTicks(actor, at) {
  const due = actor.effects.filter(effect => isLive(effect) && (effect.flags?.[MODULE_ID]?.tick?.at === at));
  for ( const effect of due ) {
    const tick = effect.flags[MODULE_ID].tick;
    if ( tick.damage ) await dealDamage(actor, tick);
    if ( tick.save ) await rollSave(actor, tick.save);
    if ( effect.flags[MODULE_ID].usesLeft ) await spendUses(actor, [effect]);
  }
}

/**
 * Смена хода: у того, чей ход закончился, срабатывают эффекты «в конце хода», у того, чей начался, «в начале хода».
 * Шаг назад в трекере боя эффекты не запускает (иначе урон в начале хода нанёсся бы дважды).
 * @param {Combat} combat
 * @param {object} prior    Предыдущий ход (`round`, `turn`, `combatantId`).
 * @param {object} current  Новый ход (`round`, `turn`, `combatantId`).
 */
async function onTurnChange(combat, prior, current) {
  if ( !game.users.activeGM?.isSelf ) return;
  if ( !turnAdvanced(prior, current) ) return;
  const ended = prior?.combatantId ? combat.combatants.get(prior.combatantId)?.actor : null;
  const started = current?.combatantId ? combat.combatants.get(current.combatantId)?.actor : null;
  if ( ended ) await runTicks(ended, "end");
  if ( started ) await runTicks(started, "start");
}

/** Подключает слежение за ходами боя. */
export function registerTicks() {
  Hooks.on("combatTurnChange", onTurnChange);
}
