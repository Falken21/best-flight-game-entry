// Keyboard and mouse state. Continuous axes are polled every frame;
// discrete actions (drop, pause, confirm) are edge-triggered callbacks.

export function createInput() {
  const keys = new Set();
  const listeners = { drop: [], pause: [], confirm: [], restart: [] };

  function emit(name) {
    for (const fn of listeners[name]) fn();
  }

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space') emit('drop');
    if (e.code === 'KeyP' || e.code === 'Escape') emit('pause');
    if (e.code === 'Enter') emit('confirm');
    if (e.code === 'KeyR') emit('restart');
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('mousedown', () => emit('confirm'));

  function axis() {
    const pitch = (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0) + (keys.has('ArrowDown') || keys.has('KeyS') ? -1 : 0);
    const roll = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) + (keys.has('ArrowLeft') || keys.has('KeyA') ? -1 : 0);
    const rudder = (keys.has('KeyE') ? 1 : 0) + (keys.has('KeyQ') ? -1 : 0);
    const throttle = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0) + (keys.has('ControlLeft') || keys.has('ControlRight') ? -1 : 0);
    // Arcade mapping wins over flight-sim convention: Up climbs, Down
    // dives, Left/Right (or A/D) bank directly, Q/E are the fine rudder.
    return { pitch, roll: roll !== 0 ? roll : rudder * 0.4, rudder, throttle, rawRoll: roll };
  }

  return {
    axis,
    on(name, fn) {
      listeners[name].push(fn);
    },
  };
}
