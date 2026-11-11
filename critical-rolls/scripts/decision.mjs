import { syncEffectItem } from "./items.mjs";
import { syncEffects } from "./effects.mjs";
import { syncMissRecord } from "./miss-log.mjs";
import { attachDamage, awaitsDamage, findDamageMessage } from "./crit.mjs";
import { isVariantSection } from "./tables.mjs";

/**
 * Приводит всё, что зависит от решения на карточке, в соответствие с ним: предмет удачи или неудачи, эффекты,
 * запись о промахе в бою и, для критических попаданий, уже брошенный урон (в режиме «Подтверждение» игрок обычно
 * бросает урон раньше, чем Мастер решает). Выполняется на клиенте активного ГМ.
 * @param {object} flags
 * @param {string} messageId  Идентификатор карточки (у новой карточки он выбирается до её создания).
 * @returns {Promise<object>}  Новые флаги карточки.
 */
export async function syncDecision(flags, messageId) {
  let updated = { ...flags };
  if ( isVariantSection(flags.section) ) {
    Object.assign(updated, await syncEffectItem(updated));
  } else {
    Object.assign(updated, await syncEffects(updated, messageId));
    if ( awaitsDamage(updated) ) {
      const damage = findDamageMessage(updated);
      if ( damage ) updated = await attachDamage(updated, damage);
    }
  }
  await syncMissRecord(updated, messageId);
  return updated;
}
