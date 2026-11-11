import { MODULE_ID } from "./settings-defs.mjs";
import { DAMAGE_RULES } from "./effects-plan.mjs";
import { spendUses } from "./effects.mjs";
import {
  d20Flags, damageChange, damageRuleMatches, halfFormula, kindOfHooks, pendingModesFor, ruleMatches
} from "./roll-rules-plan.mjs";
import { isLive, rerollDamage } from "./helpers.mjs";

/**
 * Правила бросков, которые накладывают эффекты таблиц: преимущество и помеха на d20, половина и минимум урона.
 * Эффект на акторе несёт описание правила в `flags.critical-rolls.roll`.
 * - Преимущество и помеха выставляются хуком `dnd5e.preRoll` на клиенте бросающего перед броском.
 * - Правила урона срабатывают на клиенте Мастера: бросок атаки «заряжает» урон, следующий бросок урона той же
 *   атаки заменяется.
 */

const PENDING = "pendingDamage";

/** Правила бросков актора: описание из эффекта и сам эффект. */
function rulesOf(actor, filter = () => true) {
  return (actor?.effects ?? [])
    .filter(effect => isLive(effect) && effect.flags?.[MODULE_ID]?.roll)
    .map(effect => ({ effect, rule: effect.flags[MODULE_ID].roll }))
    .filter(({ rule }) => filter(rule));
}

/**
 * Хук `dnd5e.preRoll`: добавляет преимущество и помеху по эффектам бросающего и (для атак) по эффектам целей.
 * @param {object} config
 */
function onPreRoll(config) {
  const kind = kindOfHooks(config.hookNames);
  const roll = config.rolls?.[0];
  if ( !kind || !roll ) return;

  const subject = config.subject;
  const actor = (kind === "attack") ? subject?.actor : (subject?.effects ? subject : subject?.actor);
  if ( !actor ) return;

  const targets = Array.from(game.user.targets).filter(token => token.actor);
  const context = { kind, ability: config.ability, targetUuids: targets.map(token => token.actor.uuid) };
  if ( kind === "attack" ) {
    const action = subject.getActionType?.(config.attackMode);
    context.scope = action?.startsWith("m") ? "melee" : (action?.startsWith("r") ? "ranged" : null);
    context.ability = subject.ability ?? context.ability;
  }

  const matched = rulesOf(actor, rule => ruleMatches(rule, context)).map(({ rule }) => rule.rule);
  if ( kind === "attack" ) {
    for ( const token of targets ) {
      matched.push(...rulesOf(token.actor, rule => ruleMatches(rule, { ...context, against: true })).map(({ rule }) => rule.rule));
    }
  }
  const { advantage, disadvantage } = d20Flags(matched);
  if ( !advantage && !disadvantage ) return;
  roll.options ??= {};
  if ( advantage ) roll.options.advantage = true;
  if ( disadvantage ) roll.options.disadvantage = true;
}

/** Вид атаки (рукопашная или дальнобойная) по сообщению с броском атаки. */
function attackScopeOf(message) {
  const dnd = message.flags?.dnd5e;
  const item = dnd?.item?.uuid ? fromUuidSync(dnd.item.uuid) : null;
  const value = item?.system?.activities?.get(dnd?.activity?.id)?.attack?.type?.value;
  return (value === "melee") || (value === "ranged") ? value : null;
}

/**
 * Бросок атаки «заряжает» правила урона: запоминает, как изменить бросок урона этой же атаки (по общему
 * идентификатору использования), и тратит использования («две следующие атаки»). Промах без урона заряд не
 * тратит: его снимет следующая атака. Выполняется на клиенте Мастера.
 * @param {ChatMessage} message
 * @returns {Promise<void>}
 */
export async function armDamageRules(message) {
  if ( message.flags?.dnd5e?.roll?.type !== "attack" ) return;
  const actor = message.speakerActor;
  if ( !actor ) return;

  const scope = attackScopeOf(message);
  const armed = rulesOf(actor, rule => damageRuleMatches(rule, scope));
  const modes = armed.map(({ rule }) => rule.rule);
  const current = actor.getFlag(MODULE_ID, PENDING);
  if ( modes.length ) {
    await actor.setFlag(MODULE_ID, PENDING, { modes, origin: message.flags.dnd5e.originatingMessage ?? message.id });
  } else if ( current ) {
    await actor.unsetFlag(MODULE_ID, PENDING);
  }
  await spendUses(actor, armed.map(({ effect }) => effect).filter(effect => effect.flags[MODULE_ID].usesLeft));
}

/**
 * Бросок урона после «заряженной» атаки: половина (с округлением вниз) или минимум. Заменяет броски урона в
 * сообщении и пишет в чат короткую заметку. Выполняется на клиенте Мастера.
 * @param {ChatMessage} message
 * @returns {Promise<void>}
 */
export async function applyDamageRules(message) {
  if ( message.flags?.dnd5e?.roll?.type !== "damage" ) return;
  const actor = message.speakerActor;
  const modes = pendingModesFor(actor?.getFlag(MODULE_ID, PENDING), message.flags.dnd5e.originatingMessage ?? null);
  if ( !modes.length ) return;
  await actor.unsetFlag(MODULE_ID, PENDING);

  const change = damageChange(modes.filter(mode => DAMAGE_RULES.includes(mode)));
  if ( !change ) return;
  const rolls = [];
  for ( const source of message.rolls ) {
    if ( !(source instanceof CONFIG.Dice.DamageRoll) ) {
      rolls.push(source.toJSON());
      continue;
    }
    const formula = (change === "half") ? halfFormula(source.formula) : source.formula;
    const roll = await rerollDamage(source, formula, (change === "min") ? { minimize: true } : {});
    rolls.push(roll.toJSON());
  }
  await message.update({ rolls });
  await ChatMessage.create({
    content: `<div class="critical-rolls-card"><p>${foundry.utils.escapeHTML(
      game.i18n.format(`CRITROLLS.Fx.DamageChanged.${change}`, { name: actor.name })
    )}</p></div>`,
    speaker: { alias: game.i18n.localize("CRITROLLS.Title") }
  });
}

/** Подключает хук бросков на всех клиентах. */
export function registerRollRules() {
  Hooks.on("dnd5e.preRoll", onPreRoll);
}
