import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { SETTING_DEFS, SETTING_GROUPS, labelPath } from "../scripts/settings-defs.mjs";

const lang = JSON.parse(readFileSync(new URL("../lang/ru.json", import.meta.url), "utf8"));

/** Значение по пути вида `CRITROLLS.Settings.mode.Confirm` в файле локализации. */
const resolve = path => path.split(".").reduce((node, part) => node?.[part], lang);

test("настройки: ключи уникальны, группы существуют, значения по умолчанию допустимы", () => {
  const keys = SETTING_DEFS.map(def => def.key);
  assert.equal(new Set(keys).size, keys.length);

  for ( const def of SETTING_DEFS ) {
    assert.ok(SETTING_GROUPS.includes(def.group), `${def.key}: группа ${def.group}`);
    if ( def.kind === "boolean" ) {
      assert.equal(typeof def.default, "boolean", def.key);
    } else if ( def.kind === "text" ) {
      assert.equal(typeof def.default, "string", def.key);
    } else {
      assert.equal(def.kind, "choice", def.key);
      assert.ok(def.choices?.length >= 2, def.key);
      assert.ok(def.choices.some(choice => String(choice.value) === String(def.default)), `${def.key}: значение по умолчанию`);
      if ( def.numeric ) assert.ok(def.choices.every(choice => typeof choice.value === "number"), def.key);
    }
  }
  for ( const group of SETTING_GROUPS ) assert.ok(SETTING_DEFS.some(def => def.group === group), group);
});

test("настройки: у каждой есть название, у вариантов подписи, у групп заголовки; пояснение может быть пустым, если название всё говорит", () => {
  for ( const def of SETTING_DEFS ) {
    const path = `CRITROLLS.${labelPath(def.key)}`;
    assert.ok(resolve(`${path}.Name`), `${def.key}: Name`);
    assert.equal(typeof resolve(`${path}.Hint`), "string", `${def.key}: Hint`);
    for ( const choice of def.choices ?? [] ) assert.ok(resolve(choice.label), `${def.key}: ${choice.label}`);
  }
  for ( const group of SETTING_GROUPS ) {
    assert.ok(resolve(`CRITROLLS.Settings.Group.${group}.Title`), group);
    assert.notEqual(resolve(`CRITROLLS.Settings.Group.${group}.Hint`), undefined, group);
  }
  for ( const key of ["Cancel", "Tools.SyncTables", "Tools.SyncTablesName", "Tools.ManualRoll", "Tools.ManualRollName"] ) {
    assert.ok(resolve(`CRITROLLS.Settings.${key}`), key);
  }
  for ( const key of ["Tools.SyncTablesHint", "Tools.ManualRollHint"] ) {
    assert.equal(typeof resolve(`CRITROLLS.Settings.${key}`), "string", key);
  }
});

test("настройки: всё, что читает код, зарегистрировано", () => {
  const known = new Set(SETTING_DEFS.map(def => def.key));
  const dir = new URL("../scripts/", import.meta.url);
  let checked = 0;
  for ( const file of readdirSync(dir).filter(name => name.endsWith(".mjs")) ) {
    const source = readFileSync(new URL(file, dir), "utf8");
    for ( const match of source.matchAll(/settings\.(?:get|set)\(MODULE_ID,\s*(["'`])([^"'`]+)\1/g) ) {
      const key = match[2];
      if ( key.includes("${") ) {
        // Динамические ключи: раздел или режим раздела.
        const template = key.replace(/\$\{[^}]+\}/g, "X");
        assert.ok([...known].some(k => k.replace(/\.[^.]+$/, ".X") === template), `${file}: ${key}`);
      } else {
        assert.ok(known.has(key), `${file}: неизвестная настройка ${key}`);
      }
      checked++;
    }
  }
  assert.ok(checked > 15, `проверено обращений: ${checked}`);
});
