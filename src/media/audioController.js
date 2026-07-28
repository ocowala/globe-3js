export const songMap = {
  '/suis_mois.mp3': 'suis moi - camille, zimmer',
  '/windmills.mp3': 'windmills of your mind - sting',
  '/ciao.mp3': "l'amore dice ciao - trovajoli",
  '/bean-sabine.mp3': 'bean sabine ost - howard goodall',
  '/bygone-days.mp3': 'bygone days - hisaishi',
  '/dreamers.mp3': 'sea dreamers - shankar, sting',
  '/fly.mp3': 'fly by day - anri',
  '/fillmore.mp3': 'fillmore county - vansire, floor cry',
  '/come-with-me.mp3': 'come with me - surfaces, salem ilese',
  '/crystal-settings.mp3': 'crystal settings - alyzea'
};

export let audioCtx = null;
export let analyser = null;
export let dataArray = null;

export function updateVisualizer(audio) {
  if (!analyser || !audio || audio.paused) {
    const bars = document.querySelectorAll('.audio-visualizer .bar');
    bars.forEach(bar => {
      bar.style.transform = 'scaleY(0.15)';
    });
    return;
  }

  requestAnimationFrame(() => updateVisualizer(audio));

  analyser.getByteFrequencyData(dataArray);

  const bars = document.querySelectorAll('.audio-visualizer .bar');
  if (bars.length === 4) {
    const b0 = dataArray[4] || 0;
    const b1 = dataArray[12] || 0;
    const b2 = dataArray[24] || 0;
    const b3 = dataArray[40] || 0;

    const scale0 = Math.max(0.15, b0 / 255);
    const scale1 = Math.max(0.15, b1 / 255);
    const scale2 = Math.max(0.15, b2 / 255);
    const scale3 = Math.max(0.15, b3 / 255);

    bars[0].style.transform = `scaleY(${scale0})`;
    bars[1].style.transform = `scaleY(${scale1})`;
    bars[2].style.transform = `scaleY(${scale2})`;
    bars[3].style.transform = `scaleY(${scale3})`;
  }
}

export function initAudioController() {
  const audio = document.getElementById('bg-audio');
  const audioToggle = document.getElementById('audio-toggle');
  const songNameEl = document.getElementById('song-name');

  if (audio) {
    const songKeys = Object.keys(songMap);
    const randomSong = songKeys[Math.floor(Math.random() * songKeys.length)];
    audio.src = randomSong;
    if (songNameEl) {
      songNameEl.textContent = songMap[randomSong];
    }

    audio.addEventListener('play', () => {
      if (songNameEl) songNameEl.classList.add('playing');
      if (audioToggle) audioToggle.classList.add('playing');
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      updateVisualizer(audio);
    });
    audio.addEventListener('pause', () => {
      if (songNameEl) songNameEl.classList.remove('playing');
      if (audioToggle) audioToggle.classList.remove('playing');
    });
  }

  if (audio && audioToggle) {
    let audioClickTimer = null;
    audioToggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (audioClickTimer !== null) {
        clearTimeout(audioClickTimer);
        audioClickTimer = null;

        const songKeys = Object.keys(songMap);
        let currentIdx = songKeys.indexOf(audio.getAttribute('src'));
        if (currentIdx === -1) {
          currentIdx = songKeys.findIndex(k => audio.src.endsWith(k));
        }
        const nextIdx = (currentIdx + 1) % songKeys.length;
        const nextSong = songKeys[nextIdx];

        audio.src = nextSong;
        if (songNameEl) {
          songNameEl.textContent = songMap[nextSong];
        }

        if (!audio.paused) {
          audio.play().catch(err => console.error("Audio playback failed:", err));
        }
      } else {
        audioClickTimer = setTimeout(() => {
          audioClickTimer = null;

          if (!audioCtx) {
            try {
              audioCtx = new (window.AudioContext || window.webkitAudioContext)();
              analyser = audioCtx.createAnalyser();
              analyser.fftSize = 128;
              const source = audioCtx.createMediaElementSource(audio);
              source.connect(analyser);
              analyser.connect(audioCtx.destination);
              dataArray = new Uint8Array(analyser.frequencyBinCount);
            } catch (err) {
              console.warn("Failed to initialize Web Audio context:", err);
            }
          }

          if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
          }

          if (audio.paused) {
            audio.play().catch(err => {
              console.error("Audio playback failed:", err);
            });
          } else {
            audio.pause();
          }
        }, 250);
      }
    });
  }
}
