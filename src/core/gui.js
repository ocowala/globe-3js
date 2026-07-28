// DummyGUI provides a drop-in fallback for dat.GUI when dev panel is disabled.
export class DummyGUI {
  constructor() {
    this.__folders = {};
    this.__controllers = [];
  }
  addFolder(name) {
    const folder = new DummyGUI();
    this.__folders[name] = folder;
    return folder;
  }
  add() {
    const controller = {
      step: () => controller,
      min: () => controller,
      max: () => controller,
      name: () => controller,
      onChange: (cb) => controller,
      listen: () => controller,
      updateDisplay: () => controller,
    };
    this.__controllers.push(controller);
    return controller;
  }
  addColor() {
    const controller = {
      name: () => controller,
      onChange: (cb) => controller,
      listen: () => controller,
      updateDisplay: () => controller,
    };
    this.__controllers.push(controller);
    return controller;
  }
  open() { return this; }
  close() { return this; }
  destroy() { }
  hide() { }
  show() { }
}

export const dat = typeof window !== 'undefined' && window.dat ? window.dat : { GUI: DummyGUI };

export const gui = (typeof dat !== 'undefined' && dat.GUI && dat.GUI !== DummyGUI)
  ? new dat.GUI({ autoPlace: true })
  : new DummyGUI();

export function updateGUIDisplays(targetGui = gui) {
  if (!targetGui) return;
  if (targetGui.__controllers) {
    targetGui.__controllers.forEach(c => {
      if (c && typeof c.updateDisplay === 'function') c.updateDisplay();
    });
  }
  if (targetGui.__folders) {
    Object.values(targetGui.__folders).forEach(f => updateGUIDisplays(f));
  }
}
