import { MODULE_ID } from "./settings-defs.mjs";

/**
 * Уровень группы для потолка таблиц по уровню героев.
 * Считаются персонажи, у которых есть владелец-игрок.
 * @returns {number|null}  `null`, если потолок выключен или в группе нет персонажей.
 */
export function partyLevel() {
  const mode = game.settings.get(MODULE_ID, "ceilingMode");
  if ( mode === "none" ) return null;

  const levels = game.actors
    .filter(actor => (actor.type === "character") && actor.hasPlayerOwner)
    .map(actor => actor.system.details?.level)
    .filter(Number.isFinite);
  if ( !levels.length ) return null;

  if ( mode === "partyMax" ) return Math.max(...levels);
  return Math.round(levels.reduce((sum, level) => sum + level, 0) / levels.length);
}
