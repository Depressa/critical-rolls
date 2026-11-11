import { MODULE_ID } from "./settings-defs.mjs";
import { SECTIONS } from "./classify.mjs";
import { postCard } from "./card.mjs";
import { buildManualEvent, pickColumn } from "./manual-event.mjs";
import { columnsOf, isColumnSection, isVariantSection } from "./tables.mjs";

const TEMPLATE = `modules/${MODULE_ID}/templates/manual.hbs`;

/** Подпись колонки раздела. */
function columnLabel(section, column) {
  const group = (section === SECTIONS.MISS) ? "AttackKind" : "DamageColumn";
  return game.i18n.localize(`CRITROLLS.${group}.${column}`);
}

/**
 * Участники для выбора: персонажи игроков, затем остальные существа с токенами на текущей сцене.
 * @param {Actor|null} preselected
 * @returns {{label: string, actors: {uuid: string, name: string, selected: boolean}[]}[]}
 */
function actorGroups(preselected) {
  const view = actor => ({ uuid: actor.uuid, name: actor.name, selected: actor.id === preselected?.id });
  const characters = game.actors.filter(actor => actor.type === "character");
  const seen = new Set(characters.map(actor => actor.id));
  const others = [];
  for ( const token of canvas.tokens?.placeables ?? [] ) {
    const actor = token.actor;
    if ( !actor || seen.has(actor.id) ) continue;
    seen.add(actor.id);
    others.push(actor);
  }
  const sorted = list => list.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang)).map(view);
  return [
    { label: game.i18n.localize("CRITROLLS.Manual.Characters"), actors: sorted(characters) },
    { label: game.i18n.localize("CRITROLLS.Manual.OnScene"), actors: sorted(others) }
  ].filter(group => group.actors.length);
}

/** Показывает колонки выбранного раздела; у разделов без колонок строку скрывает. */
function bindSectionSelect(root) {
  const select = root.querySelector("[name=section]");
  const column = root.querySelector("[name=column]");
  const row = root.querySelector("[data-cr-column-row]");
  const label = root.querySelector("[data-cr-column-label]");
  const update = () => {
    label.textContent = game.i18n.localize(`CRITROLLS.Manual.${(select.value === SECTIONS.MISS) ? "ColumnAttack" : "ColumnDamage"}`);
    const columns = select.selectedOptions[0].dataset.columns.split(",").filter(Boolean);
    column.replaceChildren(...columns.map(value => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = columnLabel(select.value, value);
      return option;
    }));
    row.hidden = !columns.length;
  };
  select.addEventListener("change", update);
  update();
}

/**
 * Бросает таблицу раздела вручную, без настоящей 1 или 20: открывает окно выбора и публикует обычную карточку.
 * Карточка работает как обычная (решение, эффекты, предметы). Только для Мастера.
 * @returns {Promise<ChatMessage|null>}  `null`, если окно закрыли или данных не хватило.
 */
export async function rollTableManually() {
  if ( !game.user.isGM ) return null;
  const t = key => game.i18n.localize(`CRITROLLS.Manual.${key}`);

  const preselected = canvas.tokens?.controlled[0]?.actor ?? null;
  const targets = Array.from(game.user.targets).filter(token => token.actor);
  const content = await foundry.applications.handlebars.renderTemplate(TEMPLATE, {
    labels: {
      section: t("Section"), column: t("ColumnAttack"), actor: t("Actor"), noActor: t("NoActor"),
      table: t("Table"), random: t("Random"), tableHint: t("TableHint")
    },
    sections: Object.values(SECTIONS).map((section, index) => ({
      value: section,
      label: game.i18n.localize(`CRITROLLS.Section.${section}`),
      columns: columnsOf(section).join(","),
      selected: index === 0
    })),
    actorGroups: actorGroups(preselected),
    targetsLine: targets.length
      ? game.i18n.format("CRITROLLS.Manual.Targets", { names: targets.map(target => target.name).join(", ") })
      : t("NoTargets")
  });

  const { DialogV2 } = foundry.applications.api;
  const data = await DialogV2.wait({
    window: { title: t("Title"), icon: "fa-solid fa-dice-d20" },
    position: { width: 460 },
    content,
    render: (event, dialog) => bindSectionSelect(dialog.element),
    buttons: [
      {
        action: "roll", label: t("Roll"), icon: "fa-solid fa-dice", default: true,
        callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
      },
      { action: "cancel", label: game.i18n.localize("CRITROLLS.Settings.Cancel"), icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if ( !data || (typeof data !== "object") ) return null;

  const section = data.section;
  const actor = data.actor ? await fromUuid(data.actor) : null;
  if ( isVariantSection(section) && !actor ) {
    ui.notifications.warn(t("NeedActor"));
    return null;
  }
  const number = Number(data.table);
  const table = ((data.table !== "") && Number.isInteger(number) && (number >= 1) && (number <= 60)) ? number : null;

  const event = buildManualEvent({
    section,
    column: isColumnSection(section) ? pickColumn(section, data.column) : null,
    user: game.user,
    actor: actor && { uuid: actor.uuid, name: actor.name, type: actor.type, disposition: actor.prototypeToken?.disposition },
    targets: targets.map(target => ({ name: target.name, uuid: target.actor.uuid }))
  });
  if ( !event ) return null;
  return postCard(event, section, { table });
}
