import { useAudioStore } from './audio.store';

function fmt(seconds: number | null): string {
  if (seconds === null || !isFinite(seconds) || seconds < 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function TrackList() {
  const tracks      = useAudioStore((s) => s.tracks);
  const currentIdx  = useAudioStore((s) => s.currentTrackIndex);
  const isPlaying   = useAudioStore((s) => s.isPlaying);
  const goToTrack   = useAudioStore((s) => s.goToTrack);

  if (tracks.length === 0) {
    return (
      <p className="text-xs text-slate-600 text-center mt-6 px-4 leading-relaxed">
        No audio tracks loaded.
      </p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {tracks.map((track, i) => {
        const active = i === currentIdx;
        return (
          <li key={track.id}>
            <button
              onClick={() => goToTrack(i, isPlaying)}
              className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 transition-colors ${
                active
                  ? 'bg-blue-500/15 text-blue-300'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span className="text-xs tabular-nums w-4 shrink-0 text-right">
                {active && isPlaying
                  ? <span className="text-blue-400">▶</span>
                  : <span className={active ? 'text-blue-400' : 'text-slate-600'}>{i + 1}</span>
                }
              </span>
              <span className="flex-1 text-xs truncate">{track.title}</span>
              {track.duration !== null && (
                <span className="text-xs text-slate-600 tabular-nums shrink-0">{fmt(track.duration)}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
