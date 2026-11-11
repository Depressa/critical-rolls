import { MODULE_ID } from "./settings-defs.mjs";
import {
  DAMAGE_RULES, buildItemJobs, buildJobs, consumeOn, durationPlan, irreversibleDone, isAutomatic, keepIrreversible,
  modifierChanges
} from "./effects-plan.mjs";
import { variantMarkup } from "./engine.mjs";
import { isVariantSection } from "./tables.mjs";
import { consumeTypesFor, rollKindsOf } from "./roll-rules-plan.mjs";
import { modifierValueText } from "./card-text.mjs";
import { cardTextApi, statusName } from "./helpers.mjs";

/**
 * Применение эффектов в Foundry: активные эффекты (состояния и модификаторы), урон, лечение, временные хиты.
 * Выполняется только на клиенте ГМ.
 */

const MODIFIER_ICON = "icons/svg/aura.svg";

/**
 * Значение формулы (число или кубики). Переменные берутся у актора.
 * @param {string|number} formula
 * @param {Actor} [actor]
 * @returns {Promise<number>}
 */
async function evaluate(formula, actor) {
  const roll = await new Roll(String(formula), actor?.getRollData?.() ?? {}).evaluate();
  return roll.total;
}

/**
 * Акторы, которые получают эффект. Если цели неизвестны (нет цели у атаки), берутся выделенные токены.
 * @param {object} job
 * @returns {Promise<Actor[]>}
 */
async function resolveActors(job) {
  const actors = [];
  for ( const uuid of job.targets ?? [] ) {
    const document = await fromUuid(uuid);
    const actor = document?.actor ?? document;
    if ( actor?.applyDamage ) actors.push(actor);
  }
  if ( actors.length ) return actors;
  return (canvas.tokens?.controlled ?? []).map(token => token.actor).filter(Boolean);
}

/**
 * Длительность активного эффекта по разметке.
 * @param {object} duration
 * @param {Actor} actor
 * @returns {Promise<{duration: object, rest: string|null}>}
 */
async function durationData(duration, actor) {
  const plan = durationPlan(duration);
  if ( plan.unit === "rounds" ) {
    return { duration: { rounds: Math.max(await evaluate(plan.formula, actor) * plan.factor, 1) }, rest: null };
  }
  if ( plan.unit === "seconds" ) {
    return { duration: { seconds: Math.max(await evaluate(plan.formula, actor) * plan.factor, 1) }, rest: null };
  }
  return { duration: {}, rest: (plan.unit === "rest") ? plan.rest : null };
}

/**
 * Название модификатора для эффекта на акторе: «Атака −1d4», «Проверка +2 × бонус мастерства».
 * @param {object} job
 * @returns {string}
 */
function modifierName(job) {
  const target = game.i18n.localize(`CRITROLLS.Fx.Target.${job.target}`);
  return `${target} ${modifierValueText(job.value, cardTextApi())}`;
}

/**
 * Название эффекта-правила броска на акторе: «Помеха: атаки», «Половина урона».
 * @param {object} job
 * @returns {string}
 */
function ruleName(job) {
  const rule = game.i18n.localize(`CRITROLLS.Fx.Rule.${job.rule}`);
  if ( DAMAGE_RULES.includes(job.rule) ) return rule;
  const kinds = job.rolls.map(kind => game.i18n.localize(`CRITROLLS.Fx.Roll.${kind}`)).join(", ");
  return `${rule}: ${kinds}${job.against ? ` ${game.i18n.localize("CRITROLLS.Fx.Roll.against")}` : ""}`;
}

/**
 * Название эффекта «в начале или в конце хода».
 * @param {object} job
 * @returns {string}
 */
function tickName(job) {
  const when = game.i18n.localize(`CRITROLLS.Fx.Tick.${job.at}`);
  const what = job.damage ? game.i18n.format("CRITROLLS.Fx.Text.damage", { formula: job.damage, type: "" }).trim()
    : game.i18n.localize(`CRITROLLS.Fx.Target.save`);
  return `${when}: ${what}`;
}

/**
 * Меняет уровень истощения актора. dnd5e считает истощение только по уровню на акторе (эффект с фиксированным
 * идентификатором система создаёт и удаляет сама), поэтому пустой эффект «истощение» ничего бы не дал.
 * @param {Actor} actor
 * @param {number} delta  +1 наложить, −1 снять.
 * @returns {Promise<boolean>}  `false`, если у актора нет уровня истощения.
 */
export async function changeExhaustion(actor, delta) {
  const level = actor.system?.attributes?.exhaustion;
  if ( !Number.isFinite(level) ) return false;
  const max = CONFIG.DND5E.conditionTypes?.exhaustion?.levels ?? 6;
  await actor.update({ "system.attributes.exhaustion": Math.min(Math.max(level + delta, 0), max) });
  return true;
}

/**
 * Накладывает на актора активный эффект: состояние или числовой модификатор.
 * @param {Actor} actor
 * @param {object} job
 * @param {object} context
 * @returns {Promise<string>}  UUID созданного эффекта.
 */
async function createEffect(actor, job, context) {
  const { duration, rest } = await durationData(job.duration, actor);
  const flags = { [MODULE_ID]: { messageId: context.messageId, jobIndex: job.index, rest } };
  let data;

  if ( job.kind === "status" ) {
    const effect = await ActiveEffect.implementation.fromStatusEffect(job.status);
    data = effect?.toObject?.() ?? { name: statusName(job.status), statuses: [job.status] };
    data.name = statusName(job.status);
  } else if ( job.kind === "roll" ) {
    // Правило читают хуки dnd5e в момент броска: эффект несёт только описание в флагах.
    const { rule, rolls, scope, abilities, against, onlyTargets } = job;
    data = { name: ruleName(job), img: MODIFIER_ICON, changes: [] };
    flags[MODULE_ID].roll = { rule, rolls, scope, abilities, against, onlyTargets };
    if ( job.uses ) {
      flags[MODULE_ID].usesLeft = job.uses;
      flags[MODULE_ID].consumeTypes = DAMAGE_RULES.includes(rule) ? [] : consumeTypesFor(rolls);
      if ( against ) flags[MODULE_ID].consumeAgainst = true;
    }
  } else if ( job.kind === "tick" ) {
    const { at, damage, damageType, save } = job;
    data = { name: tickName(job), img: MODIFIER_ICON, changes: [] };
    flags[MODULE_ID].tick = { at, damage, damageType: damageType ?? null, save };
    if ( job.uses ) flags[MODULE_ID].usesLeft = job.uses;
  } else {
    // КД и скорость принимают только числа, поэтому кубики вычисляются сейчас.
    const numeric = ["ac", "speed"].includes(job.target) && /d/.test(String(job.value));
    const resolved = numeric ? await evaluate(String(job.value).replace(/^\+/, ""), actor) : null;
    data = { name: modifierName(job), img: MODIFIER_ICON, changes: modifierChanges(job, resolved) };
    const consume = consumeOn(job);
    if ( consume ) {
      flags[MODULE_ID].consumeOn = consume;
      flags[MODULE_ID].usesLeft = job.uses ?? 1;
    }
  }

  const [created] = await actor.createEmbeddedDocuments("ActiveEffect", [{
    ...data,
    // С листа актора по эффекту можно перейти к карточке.
    origin: context.messageUuid ?? null,
    duration: { ...(data.duration ?? {}), ...duration },
    flags: foundry.utils.mergeObject(data.flags ?? {}, flags)
  }]);
  return created.uuid;
}

/**
 * Применяет один эффект: накладывает эффект на акторов, наносит урон, лечит и т.д.
 * @param {object} job
 * @param {object} context
 * @param {string|null} context.messageId    Карточка, которой принадлежит эффект (`null` у предметов).
 * @param {string|null} context.messageUuid
 * @returns {Promise<object>}  Обновлённое описание эффекта.
 */
export async function applyJob(job, context) {
  if ( job.kind === "crit" ) return { ...job, awaiting: true };

  const actors = await resolveActors(job);
  if ( !actors.length ) return { ...job, failed: "targets" };

  const effectUuids = [];
  const exhausted = [];
  for ( const actor of actors ) {
    switch ( job.kind ) {
      case "status":
        if ( job.status === "exhaustion" ) {
          if ( await changeExhaustion(actor, +1) ) exhausted.push(actor.uuid);
          break;
        }
        effectUuids.push(await createEffect(actor, job, context));
        break;
      case "modifier":
      case "roll":
      case "tick":
        effectUuids.push(await createEffect(actor, job, context));
        break;
      case "damage": {
        const roll = await new Roll(String(job.formula), actor.getRollData()).evaluate();
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor }),
          flavor: game.i18n.format("CRITROLLS.Fx.DamageFlavor", {
            type: job.damageType ? game.i18n.localize(`CRITROLLS.Fx.Damage.${job.damageType}`) : ""
          }).trim()
        });
        await actor.applyDamage([{ value: roll.total, ...(job.damageType ? { type: job.damageType } : {}) }]);
        break;
      }
      case "heal": {
        const value = await evaluate(job.formula, actor);
        await actor.applyDamage([{ value, type: "healing" }]);
        break;
      }
      case "tempHp":
        await actor.applyTempHP(await evaluate(job.formula, actor));
        break;
    }
  }
  return { ...job, applied: true, failed: null, effectUuids, exhausted };
}

/**
 * Снимает эффекты, наложенные карточкой: удаляет активные эффекты и возвращает уровень истощения.
 * Нанесённый урон и лечение отменить нельзя.
 * @param {object[]} jobs
 * @returns {Promise<void>}
 */
async function removeJobEffects(jobs) {
  for ( const job of jobs ?? [] ) {
    for ( const uuid of job.effectUuids ?? [] ) {
      const effect = await fromUuid(uuid);
      await effect?.delete();
    }
    for ( const uuid of job.exhausted ?? [] ) {
      const document = await fromUuid(uuid);
      const actor = document?.actor ?? document;
      if ( actor ) await changeExhaustion(actor, -1);
    }
  }
}

/**
 * Контекст применения эффектов карточки.
 * @param {string|null} messageId
 * @returns {{messageId: string|null, messageUuid: string|null}}
 */
function contextFor(messageId) {
  return { messageId, messageUuid: messageId ? `ChatMessage.${messageId}` : null };
}

/**
 * Приводит эффекты карточки в соответствие с решением.
 * - Решение «применить»: строится список эффектов, безусловные накладываются сразу (если включено).
 * - Отказ или перебросок: ранее наложенные эффекты снимаются.
 * Урон, лечение и временные хиты отменить нельзя, поэтому при пересмотре решения они не применяются второй раз:
 * их индексы хранятся в `doneIrreversible` (сбрасываются только при перебросе таблицы).
 * Для разделов с вариантами (неудача и удача) список пуст: их эффекты накладываются при использовании предмета.
 * @param {object} flags  Флаги карточки.
 * @param {string} messageId
 * @returns {Promise<{jobs: object[], doneIrreversible: number[]}>}
 */
export async function syncEffects(flags, messageId) {
  await removeJobEffects(flags.jobs);
  const done = Array.from(new Set([...(flags.doneIrreversible ?? []), ...irreversibleDone(flags.jobs)]));
  if ( flags.state.status !== "applied" ) return { jobs: [], doneIrreversible: done };

  const built = buildJobs({
    section: flags.section,
    event: flags.event,
    auto: flags.result.auto?.[0],
    fx: flags.result.fx?.[0]
  });
  const enabled = game.settings.get(MODULE_ID, "applyEffects");
  const context = contextFor(messageId);
  const jobs = [];
  for ( const job of keepIrreversible(built, done) ) {
    jobs.push((!job.keptIrreversible && isAutomatic(job, enabled)) ? await applyJob(job, context) : job);
  }
  return { jobs, doneIrreversible: Array.from(new Set([...done, ...irreversibleDone(jobs)])) };
}

/**
 * Применяет один эффект карточки по кнопке.
 * @param {object} job
 * @param {ChatMessage} message
 * @returns {Promise<object>}
 */
export function applyCardJob(job, message) {
  return applyJob(job, contextFor(message.id));
}

/**
 * Что передать Мастеру об использованном предмете удачи или неудачи: какая таблица и вариант, кто и по кому.
 * Сами эффекты Мастер берёт из данных модуля, поэтому в запросе их нет.
 * @param {Item} item            Использованный предмет.
 * @param {number} variantIndex  Какой вариант выбран.
 * @returns {object|null}        `{ actorUuid, kind, table, variantIndex, targets }`, `null`, если данных нет.
 */
export function itemEffectsPayload(item, variantIndex) {
  const flags = item.flags?.[MODULE_ID];
  const actor = item.actor;
  if ( !flags?.kind || !Number.isInteger(flags.table) || !actor ) return null;
  return {
    actorUuid: actor.uuid,
    kind: flags.kind,
    table: flags.table,
    variantIndex,
    targets: Array.from(game.user.targets).map(token => token.actor?.uuid).filter(Boolean)
  };
}

/**
 * Применяет эффекты использованного предмета удачи или неудачи. Разметка читается из данных модуля по номеру
 * таблицы и варианта; накладываются только безусловные эффекты, остальные остаются текстом. Выполняется на
 * клиенте ГМ.
 * @param {{actorUuid: string, kind: string, table: number, variantIndex: number, targets: string[]}} payload
 * @returns {Promise<void>}
 */
export async function applyItemEffects({ actorUuid, kind, table, variantIndex, targets }) {
  if ( !game.settings.get(MODULE_ID, "applyEffects") ) return;
  if ( !isVariantSection(kind) || !Number.isInteger(table) || !Number.isInteger(variantIndex) ) return;
  const markup = await variantMarkup(kind, table, variantIndex);
  if ( !markup ) return;
  const safeTargets = (Array.isArray(targets) ? targets : []).filter(uuid => typeof uuid === "string");
  for ( const job of buildItemJobs({ actorUuid, targets: safeTargets, ...markup }) ) {
    await applyJob(job, contextFor(null));
  }
}

/**
 * Тратит использование у эффектов: уменьшает счётчик и снимает эффект, когда он закончился.
 * @param {Actor} actor
 * @param {ActiveEffect[]} effects
 * @returns {Promise<void>}
 */
export async function spendUses(actor, effects) {
  const remove = [];
  const update = [];
  for ( const effect of effects ) {
    const left = (effect.flags?.[MODULE_ID]?.usesLeft ?? 1) - 1;
    if ( left <= 0 ) remove.push(effect.id);
    else update.push({ _id: effect.id, [`flags.${MODULE_ID}.usesLeft`]: left });
  }
  if ( update.length ) await actor.updateEmbeddedDocuments("ActiveEffect", update);
  if ( remove.length ) await actor.deleteEmbeddedDocuments("ActiveEffect", remove);
}

/**
 * Снимает одноразовые эффекты, когда актор совершил соответствующий бросок: модификаторы, правила d20
 * и (по броску атаки) правила «атаки по цели» у тех, по кому била атака.
 * Модификатор тратится на том же броске, к которому dnd5e его добавляет: бонус к проверкам — на проверке
 * характеристики, навыка и инструмента, бонус к навыкам — только на навыке.
 * @param {ChatMessage} message
 * @returns {Promise<void>}
 */
export async function consumeOneShots(message) {
  const type = message.flags?.dnd5e?.roll?.type;
  if ( !type ) return;
  const kinds = rollKindsOf(type);

  const actor = message.speakerActor;
  if ( actor ) {
    const spent = actor.effects.filter(effect => {
      const flags = effect.flags?.[MODULE_ID];
      return flags && (kinds.includes(flags.consumeOn) || flags.consumeTypes?.includes(type));
    });
    await spendUses(actor, spent);
  }

  if ( type === "attack" ) {
    for ( const target of message.flags?.dnd5e?.targets ?? [] ) {
      const victim = target.uuid ? fromUuidSync(target.uuid) : null;
      const holder = victim?.actor ?? victim;
      if ( !holder?.effects ) continue;
      await spendUses(holder, holder.effects.filter(effect => effect.flags?.[MODULE_ID]?.consumeAgainst));
    }
  }
}
