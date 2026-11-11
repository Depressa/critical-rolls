import { MODULE_ID } from "./settings-defs.mjs";
import { buildItemData } from "./item-data.mjs";

/**
 * Подписи для названия и активностей предмета.
 * @param {"luck"|"fumble"} kind
 * @returns {object}
 */
function itemLabels(kind) {
  return {
    kind: game.i18n.localize(`CRITROLLS.Item.${kind}`),
    deferred: game.i18n.localize("CRITROLLS.Item.Deferred"),
    use: game.i18n.localize("CRITROLLS.Item.Use"),
    variant: n => game.i18n.format("CRITROLLS.Item.Variant", { n })
  };
}

/**
 * Приводит предмет удачи или неудачи у персонажа в соответствие с решением на карточке.
 * - Решение принято: предмет выдаётся (прежний предмет этой карточки заменяется).
 * - Отказ или перебросок: предмет, выданный этой карточкой, удаляется.
 * У персонажа не бывает больше одного предмета каждого вида: по настройке старый заменяется или остаётся.
 * Выполняется только на клиенте ГМ.
 * @param {object} flags  Флаги карточки (`section`, `event`, `result`, `state`, `itemUuid`).
 * @returns {Promise<{itemUuid: string|null, itemName: string|null, itemNote: string|null}>}
 */
export async function syncEffectItem(flags) {
  const none = { itemUuid: null, itemName: null, itemNote: null };

  const { section: kind, state, result } = flags;
  const previous = flags.itemUuid ? await fromUuid(flags.itemUuid) : null;
  if ( previous ) await previous.delete();
  // Предмет этой карточки уже потрачен (или удалён): при смене решения второй не выдаётся.
  else if ( flags.itemUuid && (state.status === "applied") ) return { ...none, itemNote: "used" };

  if ( (state.status !== "applied") || result.missing ) return none;
  const actor = flags.event?.actorUuid ? await fromUuid(flags.event.actorUuid) : null;
  if ( !actor ) return none;

  let note = null;
  const others = actor.items.filter(item => item.flags?.[MODULE_ID]?.kind === kind);
  if ( others.length ) {
    if ( game.settings.get(MODULE_ID, "duplicatePolicy") === "keep" ) return { ...none, itemNote: "kept" };
    await actor.deleteEmbeddedDocuments("Item", others.map(item => item.id));
    note = "replaced";
  }

  try {
    const [item] = await actor.createEmbeddedDocuments("Item", [buildItemData({
      kind,
      table: result.table,
      variants: result.variants,
      choice: state.choice,
      labels: itemLabels(kind),
      auto: result.auto,
      fx: result.fx
    })]);
    return { itemUuid: item.uuid, itemName: item.name, itemNote: note };
  } catch(err) {
    console.error(`${MODULE_ID} | не удалось выдать предмет`, err);
    ui.notifications.error(game.i18n.localize("CRITROLLS.Item.Failed"));
    return { ...none, itemNote: "failed" };
  }
}
