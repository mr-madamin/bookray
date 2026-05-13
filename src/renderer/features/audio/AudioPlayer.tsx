import { useRef } from 'react';
import { useAudioStore } from './audio.store';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

// ── Icon components ───────────────────────────────────────────────────────────

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 translate-x-px">
      <path d="M8 5.14v14l11-7-11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function SkipBackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
    </svg>
  );
}

function SkipForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M6 18l8.5-6L6 6v12zm2-8.14 5.52 3.64L8 17.14V9.86zM16 6h2v12h-2z" />
    </svg>
  );
}

// ── Scrubber ──────────────────────────────────────────────────────────────────

function Scrubber({
  current,
  total,
  onSeek,
}: {
  current: number;
  total: number;
  onSeek: (v: number) => void;
}) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  const trackRef = useRef<HTMLDivElement>(null);

  function seekTo(clientX: number) {
    if (!total || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(ratio * total);
  }

  return (
    <div className="flex items-center gap-2 w-full max-w-xl">
      <span className="text-xs text-slate-500 tabular-nums w-9 text-right shrink-0">{fmt(current)}</span>
      <div
        ref={trackRef}
        className="relative flex-1 h-4 flex items-center group cursor-pointer"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); seekTo(e.clientX); }}
        onPointerMove={(e) => { if (e.buttons === 1) seekTo(e.clientX); }}
      >
        <div className="absolute inset-x-0 h-1 rounded-full bg-slate-700 overflow-hidden pointer-events-none">
          <div
            className="h-full bg-blue-500 rounded-full transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow
                     opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
      </div>
      <span className="text-xs text-slate-500 tabular-nums w-9 shrink-0">{fmt(total)}</span>
    </div>
  );
}

// ── AudioPlayer ───────────────────────────────────────────────────────────────

export default function AudioPlayer() {
  const tracks          = useAudioStore((s) => s.tracks);
  const idx             = useAudioStore((s) => s.currentTrackIndex);
  const isPlaying       = useAudioStore((s) => s.isPlaying);
  const currentTime     = useAudioStore((s) => s.currentTime);
  const duration        = useAudioStore((s) => s.duration);
  const playbackRate    = useAudioStore((s) => s.playbackRate);
  const toggle          = useAudioStore((s) => s.toggle);
  const seek            = useAudioStore((s) => s.seek);
  const setRate         = useAudioStore((s) => s.setRate);
  const nextTrack       = useAudioStore((s) => s.nextTrack);
  const prevTrack       = useAudioStore((s) => s.prevTrack);

  const track = tracks[idx];

  const iconBtn =
    'flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed';

  return (
    <div className="h-[72px] bg-slate-900 border-t border-slate-800 flex items-center px-5 gap-5 shrink-0 select-none">

      {/* ── Track info ── */}
      <div className="w-44 min-w-0 shrink-0">
        <p className="text-sm font-medium text-slate-200 truncate leading-snug">
          {track?.title ?? '—'}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {tracks.length > 0
            ? `Track ${idx + 1} of ${tracks.length}`
            : 'No tracks loaded'}
        </p>
      </div>

      {/* ── Centre: controls + scrubber ── */}
      <div className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
        {/* Transport row */}
        <div className="flex items-center gap-4">
          <button
            onClick={prevTrack}
            disabled={tracks.length === 0}
            className={iconBtn}
            title="Previous track / restart"
          >
            <SkipBackIcon />
          </button>

          {/* -15 s */}
          <button
            onClick={() => seek(currentTime - 15)}
            disabled={tracks.length === 0}
            className={`${iconBtn} text-xs font-semibold w-8 h-8 rounded-full hover:bg-slate-800`}
            title="Back 15 s"
          >
            15
          </button>

          {/* Play / Pause */}
          <button
            onClick={toggle}
            disabled={tracks.length === 0}
            className="w-9 h-9 rounded-full bg-white text-slate-900 flex items-center justify-center
                       hover:bg-slate-100 active:scale-95 transition-transform disabled:opacity-30
                       disabled:cursor-not-allowed"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          {/* +15 s */}
          <button
            onClick={() => seek(currentTime + 15)}
            disabled={tracks.length === 0}
            className={`${iconBtn} text-xs font-semibold w-8 h-8 rounded-full hover:bg-slate-800`}
            title="Forward 15 s"
          >
            15
          </button>

          <button
            onClick={nextTrack}
            disabled={tracks.length === 0}
            className={iconBtn}
            title="Next track"
          >
            <SkipForwardIcon />
          </button>
        </div>

        {/* Scrubber */}
        <Scrubber current={currentTime} total={duration} onSeek={seek} />
      </div>

      {/* ── Speed control ── */}
      <div className="shrink-0 flex items-center gap-0.5 bg-slate-800 rounded-lg p-0.5">
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            onClick={() => setRate(speed)}
            className={`px-2 py-1 text-xs rounded-md font-medium transition-colors ${
              playbackRate === speed
                ? 'bg-blue-500 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title={`${speed}× speed`}
          >
            {speed === 1 ? '1×' : `${speed}×`}
          </button>
        ))}
      </div>
    </div>
  );
}
