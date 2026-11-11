import { SECTIONS } from "./classify.mjs";
import { isVariantSection } from "./tables.mjs";

/**
 * Машина состояний карточки: кто участвует в решении, с чего карточка начинается, какие кнопки показывать и как
 * решение меняется по действиям. Не зависит от Foundry.
 */

/**
 * Чьи владельцы участвуют в решении по карточке и видят её при показе «Мастеру и владельцу»: персонаж бросавшего,
 * а для «Попаданий Мастера» — герои, по которым попал монстр (бросавший там сам Мастер).
 * @param {string} section
 * @param {object} event  Событие: `actorUuid`, `targetUuids`.
 * @returns {string[]}    UUID акторов.
 */
export function participantUuids(section, event) {
  if ( section === SECTIONS.HIT_GM ) return event?.targetUuids ?? [];
  return event?.actorUuid ? [event.actorUuid] : [];
}

/**
 * Состояние карточки сразу после броска таблицы.
 * @param {object} data
 * @param {boolean} data.auto          Режим «авто» для раздела.
 * @param {string} data.section
 * @param {number} data.variantCount   Число вариантов в выпавшей записи.
 * @param {boolean} data.missing       В данных нет такой таблицы.
 * @returns {{status: string, choice: (number|"both"|null), rerolls: number}}
 */
export function initialState({ auto, section, variantCount, missing }) {
  const base = { status: "pending", choice: null, rerolls: 0 };
  if ( missing ) return { ...base, status: "none" };
  if ( !auto ) return base;
  if ( isVariantSection(section) ) return { ...base, status: "applied", choice: variantCount > 1 ? "both" : 0 };
  return { ...base, status: "applied" };
}

/**
 * Нужно ли открыть этому пользователю окно решения.
 * Мастер получает окно всегда, кроме случая, когда решает игрок и владелец персонажа в сети.
 * @param {object} data
 * @param {boolean} data.enabled        Окно включено в настройках.
 * @param {boolean} data.canAct         Пользователь вправе решать (см. `canAct`).
 * @param {boolean} data.participates   Включена настройка «Игрок участвует в выборе».
 * @param {boolean} data.isGM
 * @param {boolean} data.isActiveGM     Это активный ГМ (окно не открывается у остальных ГМ).
 * @param {boolean} data.ownerOnline    В сети есть владелец-не-ГМ персонажа.
 * @returns {boolean}
 */
export function wantsDialog({ enabled, canAct, participates, isGM, isActiveGM, ownerOnline }) {
  if ( !enabled || !canAct ) return false;
  if ( !isGM ) return participates;
  if ( !isActiveGM ) return false;
  return !(participates && ownerOnline);
}

/**
 * Какие кнопки показывать в карточке, ожидающей решения.
 * @param {string} section
 * @param {number} variantCount
 * @returns {{action: string, value?: (number|string)}[]}
 */
export function buttonsFor(section, variantCount) {
  const buttons = [];
  if ( isVariantSection(section) ) {
    for ( let i = 0; i < variantCount; i++ ) buttons.push({ action: "choose", value: i });
    if ( variantCount > 1 ) buttons.push({ action: "choose", value: "both" });
  } else {
    buttons.push({ action: "apply" });
  }
  buttons.push({ action: "decline" }, { action: "reroll" });
  return buttons;
}

/**
 * Переход состояния по действию. Возвращает `null`, если действие недопустимо.
 * Ожидающую карточку решают все, кому разрешено; уже решённую (применена или отклонена) может изменить
 * только Мастер (`revise`). Перебросив таблицу, решённая карточка снова становится ожидающей.
 * При `reroll` счётчик растёт, а новый результат подставляет вызывающий код.
 * @param {object} state
 * @param {string} action                 `apply`, `choose`, `decline` или `reroll`.
 * @param {object} data
 * @param {number|string} [data.value]    Для `choose`: номер варианта (с нуля) или `both`.
 * @param {number} data.variantCount
 * @param {boolean} data.isVariantSection
 * @param {boolean} [data.revise=false]   Пересмотр уже принятого решения.
 * @returns {object|null}
 */
export function nextState(state, action, { value, variantCount, isVariantSection, revise = false }) {
  const resolved = (state?.status === "applied") || (state?.status === "declined");
  if ( (state?.status !== "pending") && !(revise && resolved) ) return null;
  switch ( action ) {
    case "apply":
      return isVariantSection ? null : { ...state, status: "applied" };
    case "choose": {
      if ( !isVariantSection ) return null;
      if ( value === "both" ) return variantCount > 1 ? { ...state, status: "applied", choice: "both" } : null;
      const index = Number(value);
      const valid = Number.isInteger(index) && (index >= 0) && (index < variantCount);
      return valid ? { ...state, status: "applied", choice: index } : null;
    }
    case "decline":
      return { ...state, status: "declined" };
    case "reroll":
      return { status: "pending", choice: null, rerolls: state.rerolls + 1 };
    default:
      return null;
  }
}

/**
 * Одно и то же ли это решение (статус и выбранный вариант). Пересмотр, который ничего не меняет, не выполняется,
 * чтобы не наложить эффекты второй раз.
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
export function sameDecision(a, b) {
  return (a?.status === b?.status) && ((a?.choice ?? null) === (b?.choice ?? null));
}
