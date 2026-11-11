import { MODULE_ID } from "./settings-defs.mjs";
import { SECTIONS } from "./classify.mjs";
import { loadSection } from "./engine.mjs";
import { TABLE_FORMULA, buildTableSpecs } from "./roll-tables-plan.mjs";

/** Подписи для названий таблиц и результатов. */
function tableNames() {
  const t = key => game.i18n.localize(`CRITROLLS.${key}`);
  return {
    section: section => t(`Section.${section}`),
    column: (section, column) => t(section === SECTIONS.MISS ? `AttackKind.${column}` : `DamageColumn.${column}`),
    result: (n, tier) => game.i18n.format("CRITROLLS.Tables.Result", { n, tier: tier ? ` · ${tier}` : "" })
  };
}

/** Итог создания таблиц для уведомления. */
function syncMessage({ created, updated }) {
  return (created || updated)
    ? game.i18n.format("CRITROLLS.Tables.Synced", { created, updated })
    : game.i18n.localize("CRITROLLS.Tables.UpToDate");
}

/**
 * Папка таблиц модуля в боковой панели (создаётся, если её нет).
 * @returns {Promise<Folder>}
 */
async function ensureFolder() {
  const existing = game.folders.find(folder => (folder.type === "RollTable") && folder.getFlag(MODULE_ID, "folder"));
  if ( existing ) return existing;
  return Folder.create({
    name: game.i18n.localize("CRITROLLS.Tables.Folder"),
    type: "RollTable",
    flags: { [MODULE_ID]: { folder: true } }
  });
}

/**
 * Данные таблицы для создания.
 * @param {object} spec
 * @param {Folder} folder
 * @returns {object}
 */
function tableData(spec, folder) {
  return {
    name: spec.name,
    formula: TABLE_FORMULA,
    folder: folder.id,
    replacement: true,
    displayRoll: true,
    results: spec.results.map(result => ({ type: "text", weight: 1, ...result })),
    flags: { [MODULE_ID]: { key: spec.key, hash: spec.hash } }
  };
}

/**
 * Создаёт или обновляет таблицы модуля в боковой панели «Таблицы». Таблица с тем же ключом и тем же содержимым
 * не трогается, изменившаяся перезаписывается (правки руками в таблицах модуля не сохраняются).
 * Только для Мастера.
 * @param {object} [options]
 * @param {boolean} [options.notify=true]  Показать итог уведомлением.
 * @returns {Promise<{created: number, updated: number, same: number}|null>}  `null`, если вызвал не Мастер.
 */
export async function syncRollTables({ notify = true } = {}) {
  if ( !game.user.isGM ) return null;
  const datasets = {};
  for ( const section of Object.values(SECTIONS) ) datasets[section] = await loadSection(section);
  const specs = buildTableSpecs(datasets, tableNames());
  const folder = await ensureFolder();
  const counts = { created: 0, updated: 0, same: 0 };

  for ( const spec of specs ) {
    const table = game.tables.find(item => item.getFlag(MODULE_ID, "key") === spec.key);
    if ( !table ) {
      await RollTable.create(tableData(spec, folder));
      counts.created++;
    } else if ( table.getFlag(MODULE_ID, "hash") === spec.hash ) {
      counts.same++;
    } else {
      // Одним запросом: без `recursive` Foundry целиком заменяет результаты (и флаги) вместо слияния по одному.
      const data = tableData(spec, folder);
      await table.update({
        name: data.name, formula: data.formula, folder: data.folder, description: "", flags: data.flags, results: data.results
      }, { recursive: false });
      counts.updated++;
    }
  }
  if ( notify ) ui.notifications.info(syncMessage(counts));
  return counts;
}

/**
 * Создаёт недостающие таблицы при запуске мира (если включено в настройках). Выполняет активный Мастер.
 */
export async function syncRollTablesOnReady() {
  if ( !game.users.activeGM?.isSelf || !game.settings.get(MODULE_ID, "autoTables") ) return;
  try {
    const counts = await syncRollTables({ notify: false });
    if ( counts && (counts.created || counts.updated) ) ui.notifications.info(syncMessage(counts));
  } catch(err) {
    console.error(`${MODULE_ID} | не удалось создать таблицы`, err);
  }
}
