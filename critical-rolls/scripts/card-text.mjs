/**
 * Тексты карточки для списка эффектов и длительностей. Не зависит от Foundry: подписи и имена приходят снаружи
 * ({@link CardTextApi}), поэтому тексты проверяются обычными тестами на всех размеченных эффектах из данных.
 */

/**
 * @typedef {object} CardTextApi
 * @property {function(string): string} localize         Подпись по ключу локализации (`CRITROLLS.…`).
 * @property {function(string, object): string} format    Подпись с подстановками.
 * @property {function(string): string} statusName        Название состояния dnd5e по идентификатору.
 * @property {function(string): string} abilityName       Название характеристики по идентификатору (`str`, `dex`, …).
 * @property {function(string): (string|null)} nameOf     Имя документа по UUID (`null`, если его нет).
 */

/**
 * Подпись длительности эффекта.
 * @param {object} [duration]
 * @param {CardTextApi} api
 * @returns {string}  Пустая строка, если длительность не задана.
 */
export function durationText(duration, api) {
  if ( !duration?.type || (duration.type === "unspecified") ) return "";
  const format = (key, data) => api.format(`CRITROLLS.Fx.Duration.${key}`, data ?? {});
  switch ( duration.type ) {
    case "rest": return format(duration.rest === "short" ? "shortRest" : "longRest");
    case "turnEnd":
    case "permanent": return format(duration.type);
    default: return format(duration.type, { n: duration.value });
  }
}

/**
 * Значение модификатора для показа: `+2 * @prof` → «+2 × бонус мастерства».
 * @param {string|number} value
 * @param {CardTextApi} api
 * @returns {string}
 */
export function modifierValueText(value, api) {
  return String(value).replace(/@prof/g, api.localize("CRITROLLS.Fx.Text.prof")).replace(/\s?\*\s?/g, " × ");
}

/**
 * Текст одного эффекта без целей и пометок.
 * @param {object} job
 * @param {CardTextApi} api
 * @returns {string}
 */
function jobText(job, api) {
  const f = (key, data) => data ? api.format(`CRITROLLS.Fx.${key}`, data) : api.localize(`CRITROLLS.Fx.${key}`);
  const typeName = type => type ? ` (${f(`Damage.${type}`)})` : "";
  const scope = { melee: f("Scope.melee"), ranged: f("Scope.ranged") };
  const duration = () => durationText(job.duration, api) ? ` ${durationText(job.duration, api)}` : "";

  switch ( job.kind ) {
    case "status":
      return `${api.statusName(job.status)}${duration()}`;
    case "damage":
      return f("Text.damage", { formula: job.formula, type: typeName(job.damageType) });
    case "heal":
      return f("Text.heal", { formula: job.formula });
    case "tempHp":
      return f("Text.tempHp", { formula: job.formula });
    case "roll": {
      const abilities = job.abilities?.map(id => api.abilityName(id)).join(", ");
      const rolls = job.rolls?.map(kind => f(`Roll.${kind}`)).join(", ") ?? "";
      const against = job.against ? ` ${f("Roll.against")}` : "";
      return [
        job.rolls ? f("Text.rule", { rule: f(`Rule.${job.rule}`), rolls: `${rolls}${against}` }) : f(`Rule.${job.rule}`),
        scope[job.scope] ?? "",
        abilities ? f("Text.abilities", { list: abilities }) : ""
      ].filter(Boolean).join(" ") + duration() + (job.uses ? ` · ${f("Text.uses", { n: job.uses })}` : "");
    }
    case "tick": {
      const parts = [];
      if ( job.damage ) {
        const formula = (job.damage === "quarterMax") ? f("Text.quarterMax") : job.damage;
        parts.push(f("Text.damage", { formula, type: typeName(job.damageType) }));
      }
      if ( job.save ) {
        parts.push(f("Text.tickSave", {
          ability: api.abilityName(job.save.ability), dc: job.save.dc, status: api.statusName(job.save.fail)
        }));
      }
      return `${f(`Tick.${job.at}`)}: ${parts.join("; ")}${duration()}`;
    }
    case "modifier": {
      const value = (job.target === "speed" && ["half", "zero"].includes(job.value))
        ? f(`Speed.${job.value}`)
        : modifierValueText(job.value, api);
      // Одноразовый модификатор: «на следующий бросок», при нескольких использованиях — «на следующие броски: N».
      const oneShot = !job.oneShot ? "" : ` · ${(job.uses > 1) ? f("Text.nextRolls", { n: job.uses }) : f("Text.oneShot")}`;
      return [f(`Target.${job.target}`), scope[job.scope] ?? "", value].filter(Boolean).join(" ") + duration() + oneShot;
    }
    case "crit":
      return f("Text.crit", { mode: f(`Mode.${job.mode}`) });
    default:
      return job.kind;
  }
}

/**
 * Пометка к эффекту: применён, ждёт броска урона, условие применения.
 * @param {object} job
 * @param {CardTextApi} api
 * @returns {string}  Пустая строка, если пометка не нужна.
 */
function jobNote(job, api) {
  const f = (key, data) => data ? api.format(`CRITROLLS.Fx.Note.${key}`, data) : api.localize(`CRITROLLS.Fx.Note.${key}`);
  if ( job.applied && (job.kind === "crit") ) return job.change ? f("critChanged", job.change) : f("critNone");
  if ( job.keptIrreversible ) return f("alreadyApplied");
  if ( job.applied ) return f("applied");
  if ( job.failed === "targets" ) return f("noTargetSelect");
  if ( (job.kind === "crit") && job.plan?.length ) return f("critPending");
  if ( job.kind === "crit" ) return f("critAwaiting");
  if ( job.when === "failedSave" ) return f("failedSave");
  if ( job.when === "choice" ) return f("choice");
  return "";
}

/**
 * Представление одного эффекта в карточке: текст, пометка и кнопка применения.
 * @param {object} job
 * @param {CardTextApi} api
 * @returns {{index: number, text: string, note: string, applied: boolean, canApply: boolean, buttonLabel: string}}
 */
export function jobView(job, api) {
  const names = (job.targets ?? []).map(uuid => api.nameOf(uuid)).filter(Boolean);
  const who = names.length ? names.join(", ") : ((job.kind === "crit") ? "" : api.localize("CRITROLLS.Fx.Note.noTarget"));
  const text = jobText(job, api);
  const canApply = !job.applied && ((job.kind !== "crit") || !!job.plan?.length);
  return {
    index: job.index,
    text: who ? `${text} → ${who}` : text,
    note: jobNote(job, api),
    applied: !!job.applied,
    canApply,
    buttonLabel: api.localize((job.kind === "crit") ? "CRITROLLS.Fx.Button.critApply" : "CRITROLLS.Fx.Button.apply")
  };
}
