import { isHandheldDevice } from '../core/context.js';

export function initInfoTooltipDeviceSpecific() {
  const tooltip = document.querySelector('.info-tooltip');
  const infoBtn = document.querySelector('.info-btn');
  if (!tooltip || !infoBtn) return;

  if (isHandheldDevice) {
    tooltip.innerHTML = `
      <div class="info-row"><span class="key">drag</span> rotate/browse</div>
      <div class="info-row"><span class="key">drag to top</span> select</div>
      <div class="info-row"><span class="key">tap card</span> zoom in</div>
      <div class="info-row"><span class="key">tap out</span> zoom out</div>
      <div class="info-row"><span class="key">swipe down</span> next scene</div>
      <div class="info-row"><span class="key">swipe up</span> prev scene</div>
    `;

    let hideTimeout = null;

    infoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isShowing = tooltip.classList.contains('show-mobile');

      if (isShowing) {
        tooltip.classList.remove('show-mobile');
        if (hideTimeout) clearTimeout(hideTimeout);
      } else {
        tooltip.classList.add('show-mobile');
        if (hideTimeout) clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
          tooltip.classList.remove('show-mobile');
        }, 5000);
      }
    });

    window.addEventListener('click', () => {
      tooltip.classList.remove('show-mobile');
      if (hideTimeout) clearTimeout(hideTimeout);
    });
  }
}
