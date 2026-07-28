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

export const dat = {
  GUI: DummyGUI
};
