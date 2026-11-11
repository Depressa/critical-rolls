import { MODULE_ID } from "./settings-defs.mjs";

/** Цвет и стиль подсветки токена для каждого сигнала. */
const PING = Object.freeze({
  crit: { style: "pulse", color: "#e0b030" },
  fumble: { style: "alert", color: "#cc2222" }
});

/**
 * Подсвечивает токен на сцене, которую сейчас смотрит этот клиент. Подсветку видят все, кто на этой сцене.
 * Скрытые токены не подсвечиваются, чтобы не выдать их положение.
 * @param {"crit"|"fumble"} kind
 * @param {string|null} tokenUuid
 */
function pingToken(kind, tokenUuid) {
  const token = tokenUuid ? fromUuidSync(tokenUuid) : null;
  if ( !token || token.hidden || (token.parent?.id !== canvas.scene?.id) ) return;
  const center = token.object?.center;
  if ( !center ) return;
  const { style, color } = PING[kind];
  canvas.ping(center, { style: CONFIG.Canvas.pings.types[style.toUpperCase()] ?? style, color, pull: false });
}

/**
 * Звук и подсветка токена при 1 или 20 на к20. Выполняется на клиенте активного ГМ; звук слышат все.
 * Скрытые броски (шёпот, слепой бросок) молчат, чтобы не раскрыть их игрокам.
 * @param {"crit"|"fumble"} kind
 * @param {object} event
 * @param {ChatMessage} message
 */
export function playSignal(kind, event, message) {
  if ( message.whisper?.length || message.blind ) return;
  if ( game.settings.get(MODULE_ID, "soundEnabled") ) {
    const src = (kind === "fumble")
      ? game.settings.get(MODULE_ID, "soundFumble")
      : game.settings.get(MODULE_ID, "soundCrit");
    if ( src ) foundry.audio.AudioHelper.play({ src, volume: 0.8, autoplay: true, loop: false }, true);
  }
  if ( game.settings.get(MODULE_ID, "pingEnabled") ) pingToken(kind, event.tokenUuid);
}
