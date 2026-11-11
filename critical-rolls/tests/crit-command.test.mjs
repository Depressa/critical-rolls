import { test } from "node:test";
import assert from "node:assert/strict";
import { CRIT_COMMAND } from "../scripts/manual-event.mjs";

test("команда /cr: распознаётся с пробелами и регистром, лишние слова допускаются", () => {
  assert.equal(CRIT_COMMAND.test("/cr"), true);
  assert.equal(CRIT_COMMAND.test("/CR"), true);
  assert.equal(CRIT_COMMAND.test("/cr промах"), true);
});

test("команда /cr: другие сообщения и команды не затрагиваются", () => {
  assert.equal(CRIT_COMMAND.test("/crit"), false);
  assert.equal(CRIT_COMMAND.test("/crx"), false);
  assert.equal(CRIT_COMMAND.test("/r 1d20"), false);
  assert.equal(CRIT_COMMAND.test("cr"), false);
  assert.equal(CRIT_COMMAND.test("привет /cr"), false);
  assert.equal(CRIT_COMMAND.test(""), false);
});
