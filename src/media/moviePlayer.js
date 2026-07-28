import * as THREE from 'three';
import { camera, controls } from '../core/context.js';
import { orbitSequence, camGuiState, setIsOrbitAnimating, setCameraFollowEnabled } from '../camera/cameraManager.js';

export let isMovieTransitionActive = false;
export function setIsMovieTransitionActive(val) { isMovieTransitionActive = val; }

export let movieTransitionState = 'idle';
export function setMovieTransitionState(st) { movieTransitionState = st; }

export let movieTransitionTimer = 0;
export function setMovieTransitionTimer(t) { movieTransitionTimer = t; }

export const movieTransitionStartPos = new THREE.Vector3();
export const movieTransitionStartTarget = new THREE.Vector3();
export const movieTransitionStartUp = new THREE.Vector3();
export const movieTransitionStartQuat = new THREE.Quaternion();
export const movieTransitionEndQuat = new THREE.Quaternion();
export let wasBgAudioPlaying = false;

export function exitMovieView() {
  if (isMovieTransitionActive && movieTransitionState !== 'idle' && movieTransitionState !== 'exiting_fade_out') {
    const movieVideo = document.getElementById('movie-video');
    if (movieVideo) {
      movieVideo.pause();
      movieVideo.currentTime = 0;
    }

    movieTransitionStartPos.copy(camera.position);
    movieTransitionStartTarget.copy(controls.target);
    movieTransitionStartQuat.copy(camera.quaternion);

    movieTransitionState = 'exiting_fade_out';
    movieTransitionTimer = 0.0;
    return true;
  }
  return false;
}

export function triggerMovieTransition() {
  const audio = document.getElementById('bg-audio');
  const songNameEl = document.getElementById('song-name');

  if (audio) {
    wasBgAudioPlaying = !audio.paused;
    const currentSrc = audio.getAttribute('src') || '';
    if (!currentSrc.includes('/castle.mp3')) {
      audio.src = '/castle.mp3';
    }
    audio.pause();
    if (songNameEl) {
      songNameEl.textContent = "howl's moving castle - hisaishi";
      songNameEl.classList.remove('playing');
    }
  }

  movieTransitionStartPos.copy(camera.position);
  movieTransitionStartTarget.copy(controls.target);
  movieTransitionStartUp.copy(camera.up);
  movieTransitionStartQuat.copy(camera.quaternion);

  const targetEuler = new THREE.Euler(1.56, 0.02, -1.21, 'XYZ');
  movieTransitionEndQuat.setFromEuler(targetEuler);

  camGuiState.paused = true;
  setIsOrbitAnimating(false);
  camGuiState.followCam = true;
  setCameraFollowEnabled(true);
  camGuiState.fov = 30;
  camera.fov = 30;
  camera.updateProjectionMatrix();

  camGuiState.activeVehicle = 'Motorcycle';
  camGuiState.camOffsetX = 2.5;
  camGuiState.camOffsetY = 3.1;
  camGuiState.camOffsetZ = -1.8;
  camGuiState.lookOffsetX = 0;
  camGuiState.lookOffsetY = 0;
  camGuiState.lookOffsetZ = 0;

  const motorcycleSeq = orbitSequence.find(s => s.name === 'Motorcycle');
  if (motorcycleSeq) {
    motorcycleSeq.camOffset.set(2.5, 3.1, -1.8);
    motorcycleSeq.lookOffset.set(0, 0, 0);
    motorcycleSeq.params.speed = 8;
  }

  isMovieTransitionActive = true;
  movieTransitionState = 'lerping_camera_to_p1';
  movieTransitionTimer = 0.0;
  controls.enabled = false;
}
