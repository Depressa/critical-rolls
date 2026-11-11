import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { escapeHtml, linkify } from "../scripts/linkify.mjs";

test("escapeHtml", () => {
  assert.equal(escapeHtml("a < b & c > d"), "a &lt; b &amp; c &gt; d");
});

test("кубики становятся бросками", () => {
  assert.equal(linkify("Вы получаете 1d4 урона."), "Вы получаете [[/r 1d4]]{1d4} урона.");
  assert.equal(linkify("бросок d100"), "бросок [[/r 1d100]]{d100}");
  assert.equal(linkify("2d6 раунда"), "[[/r 2d6]]{2d6} раунда");
  assert.equal(linkify("на 1d4+1 раунда"), "на [[/r 1d4+1]]{1d4+1} раунда");
  assert.equal(linkify("(1d4 + 1) × 5 футов"), "([[/r 1d4+1]]{1d4 + 1}) × 5 футов");
});

test("не трогает похожие на кубики слова", () => {
  assert.equal(linkify("Ваш удар"), "Ваш удар");
  assert.equal(linkify("2d"), "2d");
});

test("спасброски", () => {
  assert.equal(
    linkify("Вы должны преуспеть в спасброске Телосложения Сл 12, или падёте."),
    "Вы должны преуспеть в [[/save ability=con dc=12]]{спасброске Телосложения Сл 12}, или падёте."
  );
  assert.equal(
    linkify("в спасброске Силы или Ловкости Сл 18"),
    "в [[/save ability=str/dex dc=18]]{спасброске Силы или Ловкости Сл 18}"
  );
  assert.equal(linkify("спасбросок Мудрости Сл 20"), "[[/save ability=wis dc=20]]{спасбросок Мудрости Сл 20}");
});

test("спасброски заклинательной характеристики: «Сл N» становится кнопкой с выбором характеристики", () => {
  assert.equal(
    linkify("в спасброске вашей заклинательной характеристики Сл 12, чтобы"),
    "в спасброске вашей заклинательной характеристики [[/save ability=int/wis/cha dc=12]], чтобы"
  );
  assert.equal(
    linkify("в спасброске заклинательной характеристики Сл 16, или"),
    "в спасброске заклинательной характеристики [[/save ability=int/wis/cha dc=16]], или"
  );
  // Подписи у таких кнопок нет (dnd5e не поддерживает её вместе с несколькими характеристиками):
  assert.ok(!linkify("спасбросок заклинательной характеристики Сл 14").includes("{"));
});

test("проверки", () => {
  assert.equal(
    linkify("в проверке Силы (Атлетика) Сл 12."),
    "в [[/check ability=str skill=ath dc=12]]{проверке Силы (Атлетика) Сл 12}."
  );
  assert.equal(
    linkify("на проверку Харизмы (Убеждение)"),
    "на [[/check ability=cha skill=per]]{проверку Харизмы (Убеждение)}"
  );
  assert.equal(linkify("проверку Ловкости Сл 10"), "[[/check ability=dex dc=10]]{проверку Ловкости Сл 10}");
});

test("состояния", () => {
  const link = (id, label) => `&Reference[condition=${id} apply=false]{${label}}`;
  assert.equal(linkify("Вы ослеплены."), `Вы ${link("blinded", "ослеплены")}.`);
  assert.equal(linkify("станете ошеломлены"), `станете ${link("stunned", "ошеломлены")}`);
  assert.equal(linkify("цель сбита с ног"), `цель ${link("prone", "сбита с ног")}`);
  assert.equal(linkify("захватывает вас"), `${link("grappled", "захватывает")} вас`);
  assert.equal(linkify("оставляет вас без сознания"), `оставляет вас ${link("unconscious", "без сознания")}`);
  assert.equal(linkify("вы становитесь оглушены"), `вы становитесь ${link("deafened", "оглушены")}`);
});

test("не принимает за состояние часть другого слова", () => {
  assert.equal(linkify("Слепое пятно"), "Слепое пятно");
  assert.equal(linkify("слепните на один глаз"), "слепните на один глаз");
});

test("экранирует HTML и сохраняет разметку вокруг вставок", () => {
  assert.equal(linkify("1d4 <b> & 1d6"), "[[/r 1d4]]{1d4} &lt;b&gt; &amp; [[/r 1d6]]{1d6}");
});

test("на реальных данных: текст не теряется, идентификаторы допустимы", () => {
  const abilities = new Set(["str", "dex", "con", "int", "wis", "cha"]);
  const skills = new Set(["acr", "ani", "arc", "ath", "dec", "his", "ins", "itm", "inv", "med", "nat", "prc", "prf",
    "per", "rel", "slt", "ste", "sur"]);
  const conditions = new Set(["blinded", "deafened", "charmed", "frightened", "prone", "grappled", "paralyzed",
    "petrified", "poisoned", "restrained", "stunned", "unconscious", "incapacitated", "invisible", "exhaustion"]);
  const counts = { save: 0, check: 0, dice: 0, condition: 0 };

  for ( const name of ["miss", "hit-gm", "hit-pc", "fumble", "luck"] ) {
    const { entries } = JSON.parse(readFileSync(new URL(`../data/${name}.ru.json`, import.meta.url), "utf8"));
    for ( const entry of entries ) {
      for ( const text of [...Object.values(entry.columns ?? {}), ...(entry.variants ?? [])] ) {
        assert.ok(!/(?<![а-яё])\d*к\d/i.test(text), `${name} #${entry.table}: кость в старой записи`);
        const html = linkify(text);
        const stripped = html
          .replace(/\[\[\/save ability=int\/wis\/cha dc=(\d+)\]\]/g, "Сл $1")
          .replace(/\[\[\/(?:save|check|r) [^\]]*\]\]\{([^}]*)\}/g, "$1")
          .replace(/&Reference\[[^\]]*\]\{([^}]*)\}/g, "$1");
        assert.equal(stripped, escapeHtml(text), `${name} #${entry.table}`);

        for ( const m of html.matchAll(/\[\[\/save ability=([a-z/]+) dc=(\d+)\]\]/g) ) {
          counts.save++;
          m[1].split("/").forEach(a => assert.ok(abilities.has(a), a));
        }
        for ( const m of html.matchAll(/\[\[\/check ability=([a-z]+)(?: skill=([a-z]+))?(?: dc=\d+)?\]\]/g) ) {
          counts.check++;
          assert.ok(abilities.has(m[1]));
          if ( m[2] ) assert.ok(skills.has(m[2]), m[2]);
        }
        counts.dice += (html.match(/\[\[\/r /g) ?? []).length;
        for ( const m of html.matchAll(/&Reference\[condition=([a-z]+) apply=false\]/g) ) {
          counts.condition++;
          assert.ok(conditions.has(m[1]), m[1]);
        }
      }
    }
  }
  assert.ok(counts.save > 50 && counts.dice > 200 && counts.condition > 40, JSON.stringify(counts));
});

test("кубик внутри спасброска не дробится", () => {
  const html = linkify("спасброске Телосложения Сл 12 и 1d4 урона");
  assert.equal(html.match(/\[\[\/save/g).length, 1);
  assert.equal(html.match(/\[\[\/r/g).length, 1);
});
