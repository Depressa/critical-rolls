import { test } from "node:test";
import assert from "node:assert/strict";
import { SETTING_DEFS } from "../scripts/settings-defs.mjs";
import { CRIT_COMMAND } from "../scripts/manual-event.mjs";

// Заглушки: класс кнопок в настройках наследуется от приложения Foundry, команда `/cr` регистрируется в чате.
globalThis.foundry = {
  applications: { api: { ApplicationV2: class {} }, sidebar: { tabs: { ChatLog: { CHAT_COMMANDS: {} } } } }
};

/** Подключает главный модуль с перехватом хуков. */
async function loadWithHooks(suffix) {
  const hooks = [];
  globalThis.Hooks = {
    once: (name, fn) => hooks.push({ mode: "once", name, fn }),
    on: (name, fn) => hooks.push({ mode: "on", name, fn })
  };
  try {
    await import(`../scripts/main.mjs${suffix}`);
  } finally {
    delete globalThis.Hooks;
  }
  return hooks;
}

test("модули с кодом Foundry подключаются без ошибок (все импорты на месте), нужные хуки регистрируются", async () => {
  const hooks = await loadWithHooks("");
  const names = hooks.map(hook => hook.name);
  for ( const name of ["init", "ready", "renderSettingsConfig", "getSceneControlButtons", "createChatMessage",
    "renderChatMessageHTML", "dnd5e.postUseActivity"] ) {
    assert.ok(names.includes(name), name);
  }
  assert.equal(hooks.filter(hook => hook.name === "init").length, 1, "один хук init");
  assert.ok(hooks.filter(hook => hook.name === "init").every(hook => hook.mode === "once"));
});

test("init: регистрируются все настройки из описания и команда /cr", async () => {
  const hooks = await loadWithHooks("?init");
  const registered = [];
  const menus = [];
  globalThis.game = {
    settings: {
      registerMenu: (module, key) => menus.push(`${module}.${key}`),
      register: (module, key) => registered.push(`${module}.${key}`)
    }
  };
  try {
    hooks.find(hook => hook.name === "init").fn();
  } finally {
    delete globalThis.game;
  }
  assert.deepEqual(registered, SETTING_DEFS.map(def => `critical-rolls.${def.key}`));
  assert.deepEqual(menus, ["critical-rolls.syncTables", "critical-rolls.manualRoll"]);
  assert.equal(foundry.applications.sidebar.tabs.ChatLog.CHAT_COMMANDS.cr.rgx, CRIT_COMMAND);
});

test("кнопка в панели инструментов добавляется в группу токенов и видна только Мастеру", async () => {
  const hooks = await loadWithHooks("?tools");
  const handler = hooks.find(hook => hook.name === "getSceneControlButtons").fn;
  for ( const isGM of [true, false] ) {
    globalThis.game = { user: { isGM } };
    try {
      const controls = { tokens: { tools: { select: {} } } };
      handler(controls);
      assert.equal(controls.tokens.tools.criticalRolls.title, "CRITROLLS.Manual.Tool");
      assert.ok(controls.tokens.tools.criticalRolls.button);
      assert.equal(controls.tokens.tools.criticalRolls.visible, isGM);
      handler({});
    } finally {
      delete globalThis.game;
    }
  }
});
