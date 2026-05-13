import { create } from 'zustand';
import type { AudioTrack } from '@shared/types';

// ── Web Audio infrastructure ──────────────────────────────────────────────────
//
// Kept as module-level singletons outside React state. Audio nodes are mutable
// objects — putting them in Zustand would trigger spurious re-renders and break
// the reference identity that Web Audio API requires.
//
// Graph: HTMLAudioElement → MediaElementAudioSourceNode → GainNode → destination
//
// Speed with pitch correction: audio.playbackRate + audio.preservesPitch = true.
// The pitch preservation is performed by the browser's media pipeline (not the
// Web Audio graph), which gives us TSM (time-scale modification) for free.
// The GainNode is here for future volume/EQ expansion without restructuring.

let _el: HTMLAudioElement | null = null;
let _ctx: AudioContext | null = null;
let _listenersAttached = false;
let _seekPending = false;

function getEl(): HTMLAudioElement {
  if (!_el) {
    _el = new Audio();
    _el.preservesPitch = true;
    // crossOrigin is required for createMediaElementSource to work across the
    // bookray:// ↔ http://localhost:5173 origin boundary.
    _el.crossOrigin = 'anonymous';
  }
  return _el;
}

// Attach element → store event listeners eagerly, independent of AudioContext
// creation, so durationchange is captured when metadata loads (before play).
function ensureListeners() {
  if (_listenersAttached) return;
  _listenersAttached = true;
  const el = getEl();

  el.addEventListener('timeupdate', () => {
    if (!_seekPending) useAudioStore.getState()._setCurrentTime(el.currentTime);
  });
  el.addEventListener('seeked', () => {
    _seekPending = false;
    useAudioStore.getState()._setCurrentTime(el.currentTime);
  });
  el.addEventListener('durationchange', () => {
    if (isFinite(el.duration) && el.duration > 0) {
      useAudioStore.getState()._setDuration(el.duration);
      // Persist duration so it's available without replaying the track.
      const { tracks, currentTrackIndex } = useAudioStore.getState();
      const track = tracks[currentTrackIndex];
      if (track && track.duration === null) {
        void window.bookray.audioUpdateDuration(track.id, el.duration);
      }
    }
  });
  el.addEventListener('play',  () => useAudioStore.getState()._setPlaying(true));
  el.addEventListener('pause', () => useAudioStore.getState()._setPlaying(false));
  el.addEventListener('ended', () => useAudioStore.getState().nextTrack());
}

function ensureGraph(): AudioContext {
  if (_ctx) return _ctx;

  _ctx = new AudioContext();
  const el = getEl();
  const src = _ctx.createMediaElementSource(el);
  const gain = _ctx.createGain();
  src.connect(gain);
  gain.connect(_ctx.destination);

  return _ctx;
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface AudioState {
  tracks: AudioTrack[];
  currentTrackIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;

  // Public actions
  setTracks: (tracks: AudioTrack[]) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  setRate: (rate: number) => void;
  goToTrack: (index: number) => void;
  nextTrack: () => void;
  prevTrack: () => void;

  // Internal — called only from element event listeners above
  _setCurrentTime: (t: number) => void;
  _setDuration: (d: number) => void;
  _setPlaying: (v: boolean) => void;
}

export const useAudioStore = create<AudioState>((set, get) => ({
  tracks: [],
  currentTrackIndex: 0,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  playbackRate: 1,

  setTracks: (tracks) => {
    ensureListeners();
    const el = getEl();
    el.pause();
    el.src = '';

    set({ tracks, currentTrackIndex: 0, isPlaying: false, currentTime: 0, duration: 0 });

    if (tracks.length > 0) {
      el.src = tracks[0].url;
      el.load();
    }
  },

  play: () => {
    const ctx = ensureGraph();
    const doPlay = () => getEl().play().catch(console.error);
    if (ctx.state === 'suspended') {
      void ctx.resume().then(doPlay);
    } else {
      void doPlay();
    }
  },

  pause: () => {
    getEl().pause();
  },

  toggle: () => {
    const { isPlaying, play, pause } = get();
    if (isPlaying) pause(); else play();
  },

  seek: (seconds) => {
    _seekPending = true;
    const el = getEl();
    const maxDur = (isFinite(el.duration) && el.duration > 0) ? el.duration : get().duration;
    const clamped = Math.max(0, Math.min(maxDur, seconds));
    el.currentTime = clamped;
    set({ currentTime: clamped });
  },

  setRate: (rate) => {
    getEl().playbackRate = rate;
    set({ playbackRate: rate });
  },

  goToTrack: (index) => {
    const { tracks, isPlaying } = get();
    if (index < 0 || index >= tracks.length) return;
    const el = getEl();
    el.src = tracks[index].url;
    el.load();
    set({ currentTrackIndex: index, currentTime: 0, duration: tracks[index].duration ?? 0 });
    if (isPlaying) {
      const ctx = ensureGraph();
      const doPlay = () => el.play().catch(console.error);
      if (ctx.state === 'suspended') void ctx.resume().then(doPlay);
      else void doPlay();
    }
  },

  nextTrack: () => {
    const { tracks, currentTrackIndex } = get();
    if (currentTrackIndex < tracks.length - 1) {
      get().goToTrack(currentTrackIndex + 1);
    } else {
      // End of book — pause and reset to beginning
      get().pause();
      get().goToTrack(0);
    }
  },

  prevTrack: () => {
    const { currentTime, currentTrackIndex } = get();
    // If more than 3 s into a track, restart it; otherwise go to previous
    if (currentTime > 3) {
      get().seek(0);
    } else {
      get().goToTrack(currentTrackIndex - 1);
    }
  },

  _setCurrentTime: (t) => set({ currentTime: t }),
  _setDuration:    (d) => set({ duration: d }),
  _setPlaying:     (v) => set({ isPlaying: v }),
}));
