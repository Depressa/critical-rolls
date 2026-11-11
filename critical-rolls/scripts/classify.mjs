/**
 * Чистые функции классификации события. Не зависят от Foundry, поэтому
 * проверяются обычными тестами (tests/classify.test.mjs).
 */

export const SECTIONS = Object.freeze({
  MISS: "miss",
  HIT_GM: "hitGM",
  HIT_PC: "hitPC",
  FUMBLE: "fumble",
  LUCK: "luck"
});

const PHYSICAL_DAMAGE = new Set(["slashing", "piercing", "bludgeoning"]);

/** Типы бросков, которые не отслеживаются, пока их не включили в настройках. */
/** Какая настройка отвечает за удачу и неудачу для каждого типа броска. Промахи и попадания от атак не зависят от них. */
const ROLL_SETTINGS = Object.freeze({
  attack: "trackAttacks",
  ability: "trackChecks",
  skill: "trackChecks",
  tool: "trackChecks",
  save: "trackSaves",
  death: "trackDeathSaves",
  initiative: "trackInitiative",
  free: "trackFreeRolls",
  other: "trackFreeRolls"
});

/** Значения по умолчанию (как в настройках мира). */
const TRACKING_DEFAULTS = Object.freeze({
  trackAttacks: false,
  trackChecks: true,
  trackSaves: true,
  trackDeathSaves: false,
  trackInitiative: false,
  trackFreeRolls: false
});

/**
 * Сторона бросающего.
 * @param {string} actorType        Тип актора (`character`, `npc`, ...).
 * @param {number} [disposition]    Диспозиция токена: 1 дружелюбный, 0 нейтральный, -1 и -2 враждебный.
 * @returns {"player"|"ally"|"neutral"|"enemy"}
 */
export function sideOf(actorType, disposition) {
  if (actorType === "character") return "player";
  if (disposition === 1) return "ally";
  if (disposition === 0) return "neutral";
  return "enemy";
}

/**
 * Вид атаки для раздела «Критические промахи».
 * @param {object} data
 * @param {string} [data.classification]  `weapon`, `spell` или `unarmed`.
 * @param {string} [data.attackType]      `melee` или `ranged`.
 * @param {string} [data.itemSubtype]     Подтип оружия (`natural` для когтей и укусов).
 * @returns {"melee"|"ranged"|"natural"|"magic"}
 */
export function attackKindOf({ classification, attackType, itemSubtype } = {}) {
  if (classification === "spell") return "magic";
  if (itemSubtype === "natural") return "natural";
  return attackType === "ranged" ? "ranged" : "melee";
}

/**
 * Колонка типа урона для разделов «Критические попадания».
 * Заклинания и любой не физический основной тип урона дают «магический».
 * @param {object} data
 * @param {Iterable<string>} [data.types]  Типы урона активности по порядку.
 * @param {string} [data.classification]
 * @returns {"slashing"|"piercing"|"bludgeoning"|"magical"|null}  `null`, если тип не определить.
 */
export function damageColumnOf({ types = [], classification } = {}) {
  if (classification === "spell") return "magical";
  const [first] = Array.from(types);
  if (!first) return null;
  return PHYSICAL_DAMAGE.has(first) ? first : "magical";
}

/**
 * Нужно ли вообще смотреть на бросок этого типа.
 * @param {string} rollType
 * @param {Record<string, boolean>} settings  Значения настроек `trackDeathSaves`, `trackInitiative`, `trackFreeRolls`.
 * @returns {boolean}
 */
export function isTrackedType(rollType, settings = {}) {
  const key = ROLL_SETTINGS[rollType];
  if ( !key ) return true;
  return settings[key] ?? TRACKING_DEFAULTS[key];
}

/**
 * Разделы, которые остаются после отбора по видам бросков. Удача и неудача есть только у выбранных видов;
 * промахи и попадания от атак не отключаются этой настройкой.
 * @param {string[]} sections
 * @param {boolean} tracked  Выбран ли вид броска для удачи и неудачи.
 * @returns {string[]}
 */
export function trackedSections(sections, tracked) {
  if ( tracked ) return sections;
  return sections.filter(section => (section !== SECTIONS.LUCK) && (section !== SECTIONS.FUMBLE));
}

/**
 * Сигнал о крайнем значении кубика: звук и подсветка токена.
 * Пороги те же, что в {@link sectionsFor}.
 * @param {object} data
 * @param {number} data.natural
 * @param {number} [data.critMin=20]
 * @param {number} [data.fumbleMax=1]
 * @param {boolean} [data.ruleCrit=false]
 * @param {boolean} [data.ruleFumble=false]
 * @returns {"fumble"|"crit"|null}
 */
export function signalOf({ natural, critMin = 20, fumbleMax = 1, ruleCrit = false, ruleFumble = false }) {
  if (ruleFumble || natural <= fumbleMax) return "fumble";
  if (ruleCrit || natural >= critMin) return "crit";
  return null;
}

/**
 * Какие разделы «Критических бросков» запускает бросок.
 *
 * - 1 на атаке: «Критический промах» (кто бы ни бросал); игроку дополнительно «Неудача».
 * - 20 на атаке: попадание для игроков (игрок и союзник) или для Мастера (остальные); игроку дополнительно «Удача».
 * - 1 и 20 на любом другом к20 игрока: «Неудача» и «Удача».
 *
 * @param {object} data
 * @param {number} data.natural     Значение удержанного кубика.
 * @param {string} data.rollType    `attack`, `skill`, `save` и т.д.
 * @param {string} data.side        Результат {@link sideOf}.
 * @param {number} [data.critMin=20]   С какого значения кубика бросок считается «20» для всех.
 * @param {number} [data.fumbleMax=1]  До какого значения кубика бросок считается «1» для всех.
 * @param {boolean} [data.ruleCrit=false]    Система сама считает этот бросок критическим (порог персонажа).
 * @param {boolean} [data.ruleFumble=false]  Система сама считает этот бросок критическим провалом.
 * @returns {string[]}              Идентификаторы из {@link SECTIONS}.
 */
export function sectionsFor({ natural, rollType, side, critMin = 20, fumbleMax = 1, ruleCrit = false, ruleFumble = false }) {
  const sections = [];
  const isAttack = rollType === "attack";
  const isPlayer = side === "player";

  if (ruleFumble || natural <= fumbleMax) {
    if (isAttack) sections.push(SECTIONS.MISS);
    if (isPlayer) sections.push(SECTIONS.FUMBLE);
  } else if (ruleCrit || natural >= critMin) {
    if (isAttack) sections.push(isPlayer || side === "ally" ? SECTIONS.HIT_PC : SECTIONS.HIT_GM);
    if (isPlayer) sections.push(SECTIONS.LUCK);
  }
  return sections;
}
