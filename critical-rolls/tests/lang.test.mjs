import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const ru = JSON.parse(read("lang/ru.json"));
const en = JSON.parse(read("lang/en.json"));

/** Листовые ключи словаря с путём через точку: `CRITROLLS.Card.User` → значение. */
function leaves(object, prefix = "") {
  return Object.entries(object).flatMap(([key, value]) => (value && (typeof value === "object"))
    ? leaves(value, `${prefix}${key}.`)
    : [[`${prefix}${key}`, value]]);
}

const RU = new Map(leaves(ru));
const EN = new Map(leaves(en));

/** Плейсхолдеры строки (`{n}`, `{name}`…) в виде отсортированного списка. */
const placeholders = text => (String(text).match(/\{[^{}]*\}/g) ?? []).sort().join(" ");

test("en.json: тот же набор ключей, что ru.json, без лишних и пропущенных", () => {
  assert.deepEqual([...EN.keys()].sort(), [...RU.keys()].sort());
  assert.equal(EN.size, RU.size);
});

test("en.json: плейсхолдеры совпадают с ru.json по каждому ключу", () => {
  const mismatched = [...RU.keys()].filter(key => placeholders(RU.get(key)) !== placeholders(EN.get(key)));
  assert.deepEqual(mismatched, []);
});

test("en.json: пустые подписи там же, где в ru.json, и нет пустых английских значений", () => {
  for ( const key of RU.keys() ) {
    assert.equal(EN.get(key) === "", RU.get(key) === "", key);
  }
});

test("en.json: в английских подписях нет кириллицы", () => {
  const cyrillic = [...EN.entries()].filter(([, value]) => /\p{Script=Cyrillic}/u.test(value)).map(([key]) => key);
  assert.deepEqual(cyrillic, []);
});

test("module.json: русский и английский языки объявлены, файлы на месте", () => {
  const { languages } = JSON.parse(read("module.json"));
  const byLang = Object.fromEntries(languages.map(entry => [entry.lang, entry]));
  assert.deepEqual(byLang.en, { lang: "en", name: "English", path: "lang/en.json" });
  assert.deepEqual(byLang.ru, { lang: "ru", name: "Русский", path: "lang/ru.json" });
  for ( const entry of languages ) assert.doesNotThrow(() => read(entry.path), entry.path);
});

test("каждый ключ CRITROLLS.*, на который ссылается код и шаблоны, есть в обоих словарях", () => {
  const sources = [
    ...readdirSync(new URL("../scripts", import.meta.url)).filter(name => name.endsWith(".mjs")).map(name => `scripts/${name}`),
    ...readdirSync(new URL("../templates", import.meta.url)).map(name => `templates/${name}`)
  ];
  const refs = new Set();
  for ( const source of sources ) {
    for ( const [match] of read(source).matchAll(/CRITROLLS\.[A-Za-z0-9_.]+/g) ) refs.add(match);
  }
  // Ключ может быть группой или заканчиваться точкой, если дополняется в шаблонной строке (`Section.${section}`).
  const missing = [];
  for ( const ref of refs ) {
    const base = ref.replace(/\.$/, "");
    for ( const [name, dictionary] of [["ru", RU], ["en", EN]] ) {
      const found = [...dictionary.keys()].some(key => (key === base) || key.startsWith(`${base}.`));
      if ( !found ) missing.push(`${name}: ${ref}`);
    }
  }
  assert.deepEqual(missing, []);
});
