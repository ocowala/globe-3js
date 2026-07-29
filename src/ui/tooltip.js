import { isHandheldDevice } from '../core/context.js';

export function initInfoTooltipDeviceSpecific() {
  const infoBtn = document.getElementById('info-btn') || document.querySelector('.info-btn');
  const infoTooltip = document.getElementById('info-tooltip') || document.querySelector('.info-tooltip');
  if (!infoBtn || !infoTooltip) return;

  // Desktop click toggle
  infoBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    infoTooltip.classList.toggle('show');
  });

  window.addEventListener('click', () => {
    infoTooltip.classList.remove('show');
  });

  // Mobile device customized instruction markup & auto-dismiss
  if (isHandheldDevice) {
    infoTooltip.innerHTML = `
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
      const isShowing = infoTooltip.classList.contains('show-mobile');

      if (isShowing) {
        infoTooltip.classList.remove('show-mobile');
        if (hideTimeout) clearTimeout(hideTimeout);
      } else {
        infoTooltip.classList.add('show-mobile');
        if (hideTimeout) clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
          infoTooltip.classList.remove('show-mobile');
        }, 5000);
      }
    });

    window.addEventListener('click', () => {
      infoTooltip.classList.remove('show-mobile');
      if (hideTimeout) clearTimeout(hideTimeout);
    });
  }
}
