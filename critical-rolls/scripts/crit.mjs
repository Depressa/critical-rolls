import { MODULE_ID } from "./settings-defs.mjs";
import { buildFormula, critOperation, isDamageForEvent } from "./effects-plan.mjs";
import { damageTypeOf, rerollDamage } from "./helpers.mjs";

/**
 * Множители критического урона («двойной», «максимальный» и т.д.).
 *
 * Карточка критического попадания ждёт броска урона той же атаки. Когда он появляется, модуль заменяет сам бросок
 * в сообщении (формула строится от исходного урона, а не от удвоенного критом), чтобы карточка урона dnd5e сразу
 * показывала верный итог и применялась одной кнопкой с учётом сопротивлений:
 * - «двойной», «тройной», «четверной»: `(4d10 + 3) * 2`: урон бросается, итог умножается;
 * - «максимальный»: все кубики исходной формулы на максимум (4d10 → 40);
 * - «максимальный двойной» и т.д.: максимальный урон умножается.
 *
 * Урон может прийти и раньше решения Мастера (режим «Подтверждение»): тогда при решении карточка сама находит
 * уже брошенный урон ({@link findDamageMessage}).
 */

/**
 * Описание термов броска: число кубиков берётся до удвоения критом, лишние критические термы отбрасываются.
 * @param {DamageRoll} roll
 * @returns {object[]}
 */
function describe(roll) {
  const terms = [];
  roll.terms.forEach((term, i) => {
    const next = roll.terms[i + 1];
    const flagged = t => t?.options?.criticalBonusDamage || t?.options?.criticalFlatBonus;
    if ( flagged(term) || (term.operator && flagged(next)) ) return;
    if ( term instanceof foundry.dice.terms.DiceTerm ) {
      terms.push({
        type: "dice", number: term.options.baseNumber ?? term.number, faces: term.faces, modifiers: term.modifiers.join("")
      });
    } else {
      terms.push({ type: "raw", formula: term.formula });
    }
  });
  return terms;
}

/**
 * Что нужно сделать с каждым броском урона сообщения. Каждый пункт: `{ index, formula, maximize, extraRoll, type }`.
 * @param {string} mode
 * @param {ChatMessage} message
 * @returns {object[]}
 */
function planFor(mode, message) {
  const operation = critOperation(mode);
  const plan = [];
  if ( !operation ) return plan;
  for ( const [index, roll] of message.rolls.entries() ) {
    if ( !(roll instanceof CONFIG.Dice.DamageRoll) ) continue;
    plan.push({
      index,
      formula: buildFormula(describe(roll), { factor: operation.factor }),
      maximize: operation.maximize,
      extraRoll: !!operation.extraRoll,
      type: damageTypeOf(roll)
    });
  }
  return plan;
}

/**
 * Выполняет рассчитанные изменения: заменяет и дополняет броски урона в сообщении.
 * @param {object} job  Эффект `crit` с планом `plan` и `damageMessageId`.
 * @returns {Promise<object>}
 */
export async function applyCritPlan(job) {
  const message = job.damageMessageId ? game.messages.get(job.damageMessageId) : null;
  const plan = job.plan ?? [];
  if ( !message || !plan.length ) return { ...job, applied: true, awaiting: false };

  const total = () => message.rolls.filter(roll => roll instanceof CONFIG.Dice.DamageRoll)
    .reduce((sum, roll) => sum + roll.total, 0);
  const before = total();
  const rolls = message.rolls.map(roll => roll.toJSON());
  const additions = [];

  for ( const item of plan ) {
    const source = message.rolls[item.index];
    const roll = await rerollDamage(source, item.formula, item.maximize ? { maximize: true } : {});
    rolls[item.index] = roll.toJSON();

    // «Максимальный урон, и ещё раз бросьте кости урона»: к максимуму добавляется обычный бросок той же формулы.
    if ( item.extraRoll ) additions.push((await rerollDamage(source, item.formula)).toJSON());
  }

  await message.update({ rolls: [...rolls, ...additions] });
  return { ...job, applied: true, awaiting: false, change: { before, after: total() } };
}

/**
 * Данные сообщения, по которым урон сопоставляется с атакой.
 * @param {ChatMessage} message
 * @returns {object}
 */
function damageInfo(message) {
  const dnd = message.flags?.dnd5e ?? {};
  return {
    type: dnd.roll?.type,
    actorUuid: message.speakerActor?.uuid ?? null,
    itemUuid: dnd.item?.uuid ?? null,
    originatingMessage: dnd.originatingMessage ?? null,
    timestamp: message.timestamp
  };
}

/** Время сообщения с атакой, породившей карточку (`0`, если его уже нет). */
function attackTime(flags) {
  return game.messages.get(flags.event?.messageId)?.timestamp ?? 0;
}

/**
 * Ждёт ли карточка броска урона.
 * @param {object} flags
 * @returns {boolean}
 */
export function awaitsDamage(flags) {
  return !!flags.jobs?.some(job => (job.kind === "crit") && job.awaiting);
}

/**
 * Уже брошенный урон атаки карточки (если игрок бросил его раньше решения Мастера).
 * @param {object} flags
 * @returns {ChatMessage|null}
 */
export function findDamageMessage(flags) {
  const since = attackTime(flags);
  return game.messages.contents.slice(-60).reverse()
    .find(message => isDamageForEvent(flags.event, damageInfo(message), since)) ?? null;
}

/**
 * Карточка, ждущая урон из этого сообщения (последняя из подходящих).
 * @param {ChatMessage} message
 * @returns {ChatMessage|null}
 */
export function waitingCardFor(message) {
  const info = damageInfo(message);
  if ( info.type !== "damage" ) return null;
  return game.messages.contents.slice(-40).reverse().find(card => {
    const flags = card.flags?.[MODULE_ID];
    return flags && awaitsDamage(flags) && isDamageForEvent(flags.event, info, attackTime(flags));
  }) ?? null;
}

/**
 * Привязывает сообщение с уроном к ждущим эффектам карточки: строит план изменения и, если эффекты применяются
 * сами, сразу меняет бросок. Выполняется на клиенте активного ГМ.
 * @param {object} flags
 * @param {ChatMessage} message
 * @returns {Promise<object>}  Новые флаги карточки.
 */
export async function attachDamage(flags, message) {
  const automatic = game.settings.get(MODULE_ID, "applyEffects");
  const jobs = [];
  for ( const job of flags.jobs ) {
    if ( (job.kind !== "crit") || !job.awaiting ) {
      jobs.push(job);
      continue;
    }
    const plan = planFor(job.mode, message);
    let updated = { ...job, awaiting: false, plan, damageMessageId: message.id };
    if ( !plan.length ) updated.applied = true;
    else if ( automatic && (job.when === "always") ) updated = await applyCritPlan(updated);
    jobs.push(updated);
  }
  return { ...flags, jobs };
}
