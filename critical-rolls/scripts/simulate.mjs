/**
 * Отладочный помощник: создаёт настоящее сообщение чата с броском к20, у которого на кубике
 * заранее известное значение, чтобы проверить детектор без ожидания нужного выпадения.
 *
 * game.modules.get("critical-rolls").api.simulateRoll({ actor, natural: 1, rollType: "attack" })
 *
 * @param {object} config
 * @param {Actor} config.actor                  От чьего имени бросок.
 * @param {number} [config.natural=1]           Значение на кубике.
 * @param {string} [config.rollType="attack"]   Значение флага `dnd5e.roll.type` (`attack`, `skill`, `save`, ...).
 * @param {number} [config.modifier=0]          Бонус к броску.
 * @param {string} [config.itemUuid]            Предмет для флагов (нужен для вида атаки и типа урона).
 * @param {string} [config.activityId]          Активность предмета.
 * @returns {Promise<ChatMessage>}
 */
export async function simulateRoll({ actor, natural = 1, rollType = "attack", modifier = 0, itemUuid, activityId } = {}) {
  if ( !actor ) throw new Error("simulateRoll: нужен actor.");

  const roll = Roll.fromData({
    class: "D20Roll",
    options: {},
    formula: `1d20 + ${modifier}`,
    terms: [
      {
        class: "Die", faces: 20, number: 1, modifiers: [], options: {}, evaluated: true,
        results: [{ result: natural, active: true }]
      },
      { class: "OperatorTerm", operator: "+", options: {}, evaluated: true },
      { class: "NumericTerm", number: modifier, options: {}, evaluated: true }
    ],
    total: natural + modifier,
    evaluated: true
  });

  const dnd5e = { messageType: "roll", roll: { type: rollType } };
  if ( itemUuid ) dnd5e.item = { uuid: itemUuid };
  if ( activityId ) dnd5e.activity = { id: activityId };

  // Как у настоящей атаки: цели берутся из выбранных пользователем целей.
  dnd5e.targets = Array.from(game.user.targets)
    .filter(token => token.actor)
    .map(token => ({ name: token.name, uuid: token.actor.uuid, ac: token.actor.system.attributes?.ac?.value ?? null }));

  return ChatMessage.create({
    rolls: [roll],
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.format("CRITROLLS.Simulate.Flavor", { type: rollType }),
    flags: { dnd5e }
  });
}
