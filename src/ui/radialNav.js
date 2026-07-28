import { navLabelConfig } from './navLabels.js';

export function bindRadialNavButtons(onTriggerNavigation) {
  const nodes = document.querySelectorAll('.radial-node');
  nodes.forEach((node) => {
    node.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const idx = parseInt(node.getAttribute('data-idx'), 10);
      if (!isNaN(idx) && onTriggerNavigation) {
        onTriggerNavigation(idx);
      }
    });
  });
}
