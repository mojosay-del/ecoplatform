"use client";

import { Pause, Play } from "lucide-react";
import type { KeyboardEventHandler, PointerEventHandler, RefObject } from "react";
import { audioBarStyle, audioTimeStyle, formatAudioTime } from "./audio-player.helpers";

type AudioPlayerViewProps = {
  audioRef: RefObject<HTMLAudioElement | null>;
  waveformRef: RefObject<HTMLDivElement | null>;
  sourceUrl?: string | null;
  displayTitle: string;
  caption?: string | null;
  compact: boolean;
  className: string;
  hasSource: boolean;
  isPlaying: boolean;
  currentTime: number;
  displayDuration: number;
  progress: number;
  bars: number[];
  speedLabel: string;
  errorMessage: string | null;
  onTogglePlayback: () => Promise<void>;
  onCycleSpeed: () => void;
  onStartSeek: PointerEventHandler<HTMLDivElement>;
  onSeekByKeyboard: KeyboardEventHandler<HTMLDivElement>;
};

export function AudioPlayerView({
  audioRef,
  waveformRef,
  sourceUrl,
  displayTitle,
  caption,
  compact,
  className,
  hasSource,
  isPlaying,
  currentTime,
  displayDuration,
  progress,
  bars,
  speedLabel,
  errorMessage,
  onTogglePlayback,
  onCycleSpeed,
  onStartSeek,
  onSeekByKeyboard,
}: AudioPlayerViewProps) {
  const pauseIconSize = compact ? 24 : 30;
  const playIconSize = compact ? 28 : 34;
  const rootClassName = [
    "audio-message-player",
    compact ? "is-compact" : "",
    isPlaying ? "is-playing" : "",
    !hasSource ? "is-unavailable" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <figure className={rootClassName} aria-label={displayTitle}>
      <audio ref={audioRef} preload="metadata" src={sourceUrl ?? undefined} />
      <div className="audio-player-shell">
        <button
          className="audio-player-round-button is-primary"
          disabled={!hasSource}
          type="button"
          onClick={() => {
            void onTogglePlayback();
          }}
          aria-label={isPlaying ? "Пауза" : "Воспроизвести аудио"}
          aria-pressed={isPlaying}
        >
          {isPlaying ? (
            <Pause size={pauseIconSize} strokeWidth={3} aria-hidden="true" />
          ) : (
            <Play size={playIconSize} fill="currentColor" strokeWidth={0} aria-hidden="true" />
          )}
        </button>

        <div className="audio-player-track">
          <div
            ref={waveformRef}
            className="audio-player-waveform"
            role="slider"
            tabIndex={hasSource ? 0 : -1}
            aria-label="Позиция аудио"
            aria-valuemin={0}
            aria-valuemax={Math.max(Math.round(displayDuration), 0)}
            aria-valuenow={Math.round(currentTime)}
            aria-valuetext={`${formatAudioTime(currentTime)} из ${formatAudioTime(displayDuration)}`}
            onPointerDown={onStartSeek}
            onKeyDown={onSeekByKeyboard}
          >
            <div className="audio-player-waveform-bars" aria-hidden="true">
              {bars.map((bar, index) => {
                const barProgress = bars.length <= 1 ? 1 : index / (bars.length - 1);
                return (
                  <span
                    className={barProgress <= progress ? "is-filled" : ""}
                    key={`${index}-${bar.toFixed(3)}`}
                    style={audioBarStyle(bar, compact)}
                  />
                );
              })}
            </div>
          </div>
          <span className="audio-player-time" style={audioTimeStyle(progress)}>
            {formatAudioTime(currentTime)}
          </span>
        </div>

        <button
          className="audio-player-speed"
          disabled={!hasSource}
          type="button"
          onClick={onCycleSpeed}
          aria-label={`Скорость воспроизведения ${speedLabel}. Нажмите, чтобы изменить.`}
        >
          {speedLabel}
        </button>
      </div>

      {!hasSource ? <figcaption>Аудиофайл пока недоступен.</figcaption> : null}
      {hasSource && errorMessage ? <figcaption>{errorMessage}</figcaption> : null}
      {hasSource && caption && !compact ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
