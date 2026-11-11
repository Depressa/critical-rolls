/**
 * Превращает обычный русский текст эффекта в HTML с вставками dnd5e (энричерами): состояния становятся ссылками
 * на описание, кубики и спасброски бросками по клику. Чат Foundry сам обрабатывает такую разметку при показе.
 * Не зависит от Foundry, поэтому проверяется обычными тестами.
 */

/** Характеристики в родительном падеже → идентификаторы dnd5e. */
const ABILITIES = Object.freeze({
  "Силы": "str",
  "Ловкости": "dex",
  "Телосложения": "con",
  "Интеллекта": "int",
  "Мудрости": "wis",
  "Харизмы": "cha"
});

/** Навыки (как они названы в таблицах) → идентификаторы dnd5e. */
const SKILLS = Object.freeze({
  "Акробатика": "acr",
  "Уход за животными": "ani",
  "Магия": "arc",
  "Атлетика": "ath",
  "Обман": "dec",
  "История": "his",
  "Проницательность": "ins",
  "Запугивание": "itm",
  "Расследование": "inv",
  "Медицина": "med",
  "Природа": "nat",
  "Восприятие": "prc",
  "Выступление": "prf",
  "Убеждение": "per",
  "Религия": "rel",
  "Ловкость рук": "slt",
  "Скрытность": "ste",
  "Выживание": "sur"
});

/** Состояния: основа слова (регулярное выражение) → идентификатор состояния dnd5e. */
const CONDITIONS = Object.freeze([
  ["blinded", "ослеп[а-яё]*"],
  ["deafened", "оглуш[а-яё]*"],
  ["charmed", "очаров[а-яё]*"],
  ["frightened", "(?:ис|на)пуган[а-яё]*"],
  ["prone", "сб(?:ит|ива)[а-яё]*\\s+с\\s+ног|(?:упад|пада)[а-яё]*\\s+ничком"],
  ["grappled", "(?:за)?схват[а-яё]*|захватыва[а-яё]*"],
  ["paralyzed", "парализ[а-яё]*"],
  ["petrified", "окамене[а-яё]*"],
  ["poisoned", "отравл[а-яё]*"],
  ["restrained", "опутан[а-яё]*"],
  ["stunned", "ошеломл[а-яё]*"],
  ["unconscious", "без\\s+сознания|(?:терят|потеря)[а-яё]*\\s+сознани[а-яё]*"],
  ["incapacitated", "недееспособ[а-яё]*"],
  ["invisible", "невидим[а-яё]*"],
  ["exhaustion", "истощени[а-яё]*"]
]);

const ABILITY_WORDS = Object.keys(ABILITIES).join("|");
const SKILL_WORDS = Object.keys(SKILLS).join("|");

/** Приоритет при пересечении совпадений: меньше значит важнее. */
const PRIORITY = Object.freeze({ check: 0, dice: 1, condition: 2 });

/**
 * Экранирует текст для вставки в HTML.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * Совпадения для спасбросков: «спасброске Телосложения Сл 12», «спасброске Силы или Ловкости Сл 18».
 * @param {string} text
 * @returns {object[]}
 */
function findSaves(text) {
  const pattern = new RegExp(
    `спасбро(?:сок|ске|ска|ску|ском|ски)\\s+(${ABILITY_WORDS})(?:\\s+или\\s+(${ABILITY_WORDS}))?\\s+Сл\\s+(\\d+)`, "gu"
  );
  return Array.from(text.matchAll(pattern), match => {
    const abilities = [match[1], match[2]].filter(Boolean).map(word => ABILITIES[word]).join("/");
    return {
      start: match.index,
      end: match.index + match[0].length,
      priority: PRIORITY.check,
      markup: `[[/save ability=${abilities} dc=${match[3]}]]`,
      label: match[0]
    };
  });
}

/**
 * Спасброски «заклинательной характеристики»: у них нет одной характеристики, поэтому «Сл N» заменяется кнопкой
 * спасброска с выбором из характеристик заклинателей (Интеллект, Мудрость, Харизма). Подпись у такой кнопки задать
 * нельзя (dnd5e не поддерживает её вместе с несколькими характеристиками), поэтому «Сл N» уходит в саму кнопку.
 * @param {string} text
 * @returns {object[]}
 */
function findSpellcastingSaves(text) {
  const pattern = /(?<=спасбро(?:сок|ске|ска|ску|ском|ски)\s+(?:вашей\s+|своей\s+)?заклинательной\s+характеристики\s+)Сл\s+(\d+)/gu;
  return Array.from(text.matchAll(pattern), match => ({
    start: match.index,
    end: match.index + match[0].length,
    priority: PRIORITY.check,
    markup: `[[/save ability=int/wis/cha dc=${match[1]}]]`,
    label: null
  }));
}

/**
 * Совпадения для проверок: «проверке Силы (Атлетика) Сл 12», «проверку Харизмы (Убеждение)», «проверку Ловкости Сл 10».
 * @param {string} text
 * @returns {object[]}
 */
function findChecks(text) {
  const pattern = new RegExp(
    `провер(?:ку|ке|ка|ки|ок)\\s+(${ABILITY_WORDS})(?:\\s+\\((${SKILL_WORDS})\\))?(?:\\s+Сл\\s+(\\d+))?`, "gu"
  );
  return Array.from(text.matchAll(pattern), match => {
    let markup = `[[/check ability=${ABILITIES[match[1]]}`;
    if ( match[2] ) markup += ` skill=${SKILLS[match[2]]}`;
    if ( match[3] ) markup += ` dc=${match[3]}`;
    return {
      start: match.index,
      end: match.index + match[0].length,
      priority: PRIORITY.check,
      markup: `${markup}]]`,
      label: match[0]
    };
  });
}

/**
 * Совпадения для кубиков: «1d4», «2d6», «d100», «1d4+1», «1d4 + 1».
 * @param {string} text
 * @returns {object[]}
 */
function findDice(text) {
  const pattern = /(?<![\p{L}\d])(\d*)d(\d+)(?:(\s?[+-]\s?)(\d+))?(?![\p{L}\d])/gu;
  return Array.from(text.matchAll(pattern), match => {
    const formula = `${match[1] || 1}d${match[2]}${match[3] ? `${match[3].trim()}${match[4]}` : ""}`;
    return {
      start: match.index,
      end: match.index + match[0].length,
      priority: PRIORITY.dice,
      markup: `[[/r ${formula}]]`,
      label: match[0]
    };
  });
}

/**
 * Совпадения для состояний: ссылки на описание состояния.
 * @param {string} text
 * @returns {object[]}
 */
function findConditions(text) {
  const found = [];
  for ( const [id, stem] of CONDITIONS ) {
    const pattern = new RegExp(`(?<![а-яёА-ЯЁ])(?:${stem})`, "giu");
    for ( const match of text.matchAll(pattern) ) {
      found.push({
        start: match.index,
        end: match.index + match[0].length,
        priority: PRIORITY.condition,
        markup: `&Reference[condition=${id} apply=false]`,
        label: match[0]
      });
    }
  }
  return found;
}

/**
 * Превращает текст эффекта в HTML с вставками dnd5e.
 * @param {string} text  Обычный текст (кости записаны как 1d4).
 * @returns {string}     Готовый к показу в чате HTML (текст экранирован).
 */
export function linkify(text) {
  const candidates = [
    ...findSaves(text), ...findSpellcastingSaves(text), ...findChecks(text), ...findDice(text), ...findConditions(text)
  ]
    .sort((a, b) => (a.start - b.start) || (a.priority - b.priority) || ((b.end - b.start) - (a.end - a.start)));

  let html = "";
  let cursor = 0;
  for ( const item of candidates ) {
    if ( item.start < cursor ) continue;
    html += escapeHtml(text.slice(cursor, item.start));
    html += (item.label === null) ? item.markup : `${item.markup}{${escapeHtml(item.label)}}`;
    cursor = item.end;
  }
  return html + escapeHtml(text.slice(cursor));
}
