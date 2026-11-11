import { attackKindOf, damageColumnOf, sideOf } from "./classify.mjs";

/**
 * Находит в сообщении вычисленный бросок, начинающийся с к20.
 * @param {ChatMessage} message
 * @returns {{roll: Roll, die: foundry.dice.terms.Die, isD20Roll: boolean}|null}
 */
function findD20(message) {
  for ( const roll of message.rolls ?? [] ) {
    if ( !Number.isFinite(roll.total) ) continue;
    if ( roll instanceof CONFIG.Dice.D20Roll ) {
      if ( roll.validD20Roll ) return { roll, die: roll.d20, isD20Roll: true };
      continue;
    }
    const first = roll.terms?.[0];
    if ( (first instanceof foundry.dice.terms.Die) && (first.faces === 20) ) {
      return { roll, die: first, isD20Roll: false };
    }
  }
  return null;
}

/**
 * Тип броска: значение флага dnd5e, либо `initiative`, `other` (к20 без флага) или `free` (свободный бросок).
 * @param {ChatMessage} message
 * @param {boolean} isD20Roll
 * @returns {string}
 */
function rollTypeOf(message, isD20Roll) {
  if ( message.flags?.core?.initiativeRoll ) return "initiative";
  return message.flags?.dnd5e?.roll?.type ?? (isD20Roll ? "other" : "free");
}

/**
 * Безопасно получить документ по UUID без обращения к серверу.
 * @param {string} [uuid]
 * @returns {foundry.abstract.Document|null}
 */
function resolveSync(uuid) {
  if ( !uuid ) return null;
  try {
    return fromUuidSync(uuid) ?? null;
  } catch(err) {
    return null;
  }
}

/**
 * Собирает описание события из сообщения чата.
 * @param {ChatMessage} message
 * @returns {object|null}  `null`, если в сообщении нет броска к20.
 */
export function extractEvent(message) {
  const found = findD20(message);
  if ( !found ) return null;
  const { roll, die, isD20Roll } = found;

  const dnd = message.flags?.dnd5e ?? {};
  const rollType = rollTypeOf(message, isD20Roll);
  const author = message.author;
  const actor = message.speakerActor ?? (author?.isGM ? null : author?.character) ?? null;

  const { scene, token } = message.speaker ?? {};
  const tokenDoc = (scene && token) ? game.scenes.get(scene)?.tokens.get(token) : null;
  const disposition = tokenDoc?.disposition ?? actor?.prototypeToken?.disposition;
  const side = sideOf(actor?.type, disposition);

  const item = resolveSync(dnd.item?.uuid);
  const activity = item?.system?.activities?.get(dnd.activity?.id) ?? null;

  const event = {
    messageId: message.id,
    // Общий идентификатор использования у атаки и её урона (по нему карточка попадания находит свой урон).
    usageMessageId: dnd.originatingMessage ?? null,
    // Скрытый бросок (шёпотом или вслепую): карточка уходит только Мастеру.
    hidden: !!(message.whisper?.length || message.blind),
    userId: author?.id ?? null,
    userName: author?.name ?? "?",
    userIsGM: !!author?.isGM,
    actorUuid: actor?.uuid ?? null,
    actorName: actor?.name ?? null,
    tokenName: tokenDoc?.name ?? null,
    tokenUuid: tokenDoc?.uuid ?? null,
    side,
    rollType,
    natural: die.total,
    // Порог критического броска у этого персонажа и оружия по правилам dnd5e (у Чемпиона крит с 19).
    ruleCrit: isD20Roll && !!die.isCriticalSuccess,
    ruleFumble: isD20Roll && !!die.isCriticalFailure,
    total: roll.total,
    results: die.results.map(r => ({ value: r.result, kept: !!r.active && !r.discarded })),
    mode: roll.hasAdvantage ? "advantage" : (roll.hasDisadvantage ? "disadvantage" : "normal"),
    itemUuid: dnd.item?.uuid ?? null,
    itemName: item?.name ?? null,
    activityName: activity?.name ?? null,
    targets: (dnd.targets ?? []).map(t => t.name),
    targetUuids: (dnd.targets ?? []).map(t => t.uuid).filter(Boolean),
    attackKind: null,
    damageColumn: null
  };

  if ( rollType === "attack" ) {
    const classification = activity?.attack?.type?.classification;
    event.attackKind = attackKindOf({
      classification,
      attackType: activity?.attack?.type?.value,
      itemSubtype: item?.system?.type?.value
    });
    event.damageColumn = damageColumnOf({
      classification,
      types: (activity?.damage?.parts ?? []).flatMap(part => Array.from(part.types ?? []))
    });
  }

  return event;
}
