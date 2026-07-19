"use strict";
// ============================================================
// Ввод: клавиатура (стрелки/WASD + Z/X/Shift/E/Enter/Esc)
// ============================================================
const Input = (() => {
  const down = new Set();
  const pressed = new Set();

  const MAP = {
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    ArrowUp: "jump", KeyW: "jump", Space: "jump", KeyZ: "jump",
    ShiftLeft: "dash", ShiftRight: "dash", KeyX: "dash",
    KeyE: "interact", Enter: "interact",
    Escape: "pause", KeyQ: "quit",
  };

  window.addEventListener("keydown", (e) => {
    const a = MAP[e.code];
    if (!a) return;
    e.preventDefault();
    if (!down.has(a)) pressed.add(a);
    down.add(a);
    if (typeof SFX !== "undefined") SFX.unlock();
  });
  window.addEventListener("keyup", (e) => {
    const a = MAP[e.code];
    if (a) down.delete(a);
  });
  window.addEventListener("blur", () => down.clear());

  return {
    held: (a) => down.has(a),
    // одноразовое нажатие (edge); сбрасывается в конце кадра
    hit: (a) => pressed.has(a),
    endFrame: () => pressed.clear(),
  };
})();
