"use client";

import { Pause, Play, Square } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
const AUDIO_PLAY_EVENT = "ecoplatform-audio-player:play";

type AudioMessagePlayerProps = {
  sourceUrl?: string | null;
  title?: string | null;
  caption?: string | null;
  durationSeconds?: number | null;
  compact?: boolean;
  className?: string;
};

type WindowWithLegacyAudioContext = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export function AudioMessagePlayer({
  sourceUrl,
  title,
  caption,
  durationSeconds,
  compact = false,
  className = "",
}: AudioMessagePlayerProps) {
  const reactId = useId();
  const playerId = useMemo(() => `audio-${reactId.replace(/:/g, "")}`, [reactId]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const [playbackRate, setPlaybackRate] = useState<(typeof PLAYBACK_SPEEDS)[number]>(1);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const barCount = compact ? 34 : 58;
  const waveformSeed = `${title ?? ""}|${sourceUrl ?? ""}|${durationSeconds ?? ""}`;
  const fallbackBars = useMemo(() => buildFallbackBars(waveformSeed, barCount), [barCount, waveformSeed]);
  const [bars, setBars] = useState(fallbackBars);
  const displayTitle = title?.trim() || "Аудиоверсия";
  const displayDuration = duration > 0 ? duration : (durationSeconds ?? 0);
  const progress = displayDuration > 0 ? Math.min(Math.max(currentTime / displayDuration, 0), 1) : 0;
  const hasSource = Boolean(sourceUrl);

  useEffect(() => {
    setBars(fallbackBars);
    if (!sourceUrl) return;
    const audioSourceUrl = sourceUrl;

    let isActive = true;
    let audioContext: AudioContext | null = null;
    const controller = new AbortController();

    async function loadWaveform() {
      try {
        const AudioContextCtor =
          window.AudioContext ?? (window as WindowWithLegacyAudioContext).webkitAudioContext ?? null;
        if (!AudioContextCtor) return;
        const response = await fetch(audioSourceUrl, { signal: controller.signal });
        if (!response.ok) return;
        const buffer = await response.arrayBuffer();
        audioContext = new AudioContextCtor();
        const decoded = await audioContext.decodeAudioData(buffer);
        if (isActive) {
          setBars(extractWaveformBars(decoded, barCount));
        }
      } catch {
        if (isActive) setBars(fallbackBars);
      } finally {
        await audioContext?.close().catch(() => undefined);
      }
    }

    void loadWaveform();

    return () => {
      isActive = false;
      controller.abort();
      void audioContext?.close().catch(() => undefined);
    };
  }, [barCount, fallbackBars, sourceUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const audioElement = audio;

    function syncDuration() {
      const nextDuration =
        Number.isFinite(audioElement.duration) && audioElement.duration > 0
          ? audioElement.duration
          : (durationSeconds ?? 0);
      setDuration(nextDuration);
    }

    function syncTime() {
      setCurrentTime(Number.isFinite(audioElement.currentTime) ? audioElement.currentTime : 0);
    }

    function syncPlayState() {
      setIsPlaying(!audioElement.paused);
    }

    function handleEnded() {
      setIsPlaying(false);
      setCurrentTime(0);
      audioElement.currentTime = 0;
    }

    function handleError() {
      setErrorMessage("Аудиофайл сейчас недоступен.");
    }

    audioElement.addEventListener("loadedmetadata", syncDuration);
    audioElement.addEventListener("durationchange", syncDuration);
    audioElement.addEventListener("timeupdate", syncTime);
    audioElement.addEventListener("play", syncPlayState);
    audioElement.addEventListener("pause", syncPlayState);
    audioElement.addEventListener("ended", handleEnded);
    audioElement.addEventListener("error", handleError);
    syncDuration();
    syncTime();

    return () => {
      audioElement.removeEventListener("loadedmetadata", syncDuration);
      audioElement.removeEventListener("durationchange", syncDuration);
      audioElement.removeEventListener("timeupdate", syncTime);
      audioElement.removeEventListener("play", syncPlayState);
      audioElement.removeEventListener("pause", syncPlayState);
      audioElement.removeEventListener("ended", handleEnded);
      audioElement.removeEventListener("error", handleError);
    };
  }, [durationSeconds]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.playbackRate = playbackRate;
    audio.load();
    setCurrentTime(0);
    setDuration(durationSeconds ?? 0);
    setIsPlaying(false);
    setErrorMessage(null);
  }, [durationSeconds, playbackRate, sourceUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    function pauseWhenAnotherStarts(event: Event) {
      const detail = (event as CustomEvent<{ playerId?: string }>).detail;
      if (detail?.playerId === playerId) return;
      audioRef.current?.pause();
    }

    window.addEventListener(AUDIO_PLAY_EVENT, pauseWhenAnotherStarts as EventListener);
    return () => window.removeEventListener(AUDIO_PLAY_EVENT, pauseWhenAnotherStarts as EventListener);
  }, [playerId]);

  const seekToClientX = useCallback(
    (clientX: number) => {
      const audio = audioRef.current;
      const waveform = waveformRef.current;
      if (!audio || !waveform || displayDuration <= 0) return;
      const rect = waveform.getBoundingClientRect();
      const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      const nextTime = ratio * displayDuration;
      audio.currentTime = nextTime;
      setCurrentTime(nextTime);
    },
    [displayDuration],
  );

  useEffect(() => {
    if (!isDragging) return;

    function handlePointerMove(event: PointerEvent) {
      seekToClientX(event.clientX);
    }

    function handlePointerUp(event: PointerEvent) {
      seekToClientX(event.clientX);
      setIsDragging(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isDragging, seekToClientX]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !sourceUrl) return;
    setErrorMessage(null);

    if (!audio.paused) {
      audio.pause();
      return;
    }

    window.dispatchEvent(new CustomEvent(AUDIO_PLAY_EVENT, { detail: { playerId } }));
    try {
      audio.playbackRate = playbackRate;
      await audio.play();
    } catch {
      setErrorMessage("Не удалось запустить аудио.");
      setIsPlaying(false);
    }
  }

  function stopPlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);
  }

  function changeSpeed(event: ChangeEvent<HTMLSelectElement>) {
    const nextSpeed = Number(event.target.value) as (typeof PLAYBACK_SPEEDS)[number];
    setPlaybackRate(nextSpeed);
    if (audioRef.current) audioRef.current.playbackRate = nextSpeed;
  }

  function startSeek(event: ReactPointerEvent<HTMLDivElement>) {
    if (!hasSource || displayDuration <= 0) return;
    event.preventDefault();
    seekToClientX(event.clientX);
    setIsDragging(true);
  }

  function seekByKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !hasSource || displayDuration <= 0) return;
    const step = event.shiftKey ? 15 : 5;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      const nextTime = Math.max(audio.currentTime - step, 0);
      audio.currentTime = nextTime;
      setCurrentTime(nextTime);
    }
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      const nextTime = Math.min(audio.currentTime + step, displayDuration);
      audio.currentTime = nextTime;
      setCurrentTime(nextTime);
    }
    if (event.key === "Home") {
      event.preventDefault();
      audio.currentTime = 0;
      setCurrentTime(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      audio.currentTime = displayDuration;
      setCurrentTime(displayDuration);
    }
  }

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
    <figure className={rootClassName}>
      <audio ref={audioRef} preload="metadata" src={sourceUrl ?? undefined} />
      <div className="audio-player-shell">
        <button
          className="audio-player-round-button is-primary"
          disabled={!hasSource}
          type="button"
          onClick={togglePlayback}
          aria-label={isPlaying ? "Пауза" : "Воспроизвести аудио"}
          aria-pressed={isPlaying}
        >
          {isPlaying ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
        </button>

        <div className="audio-player-body">
          <div className="audio-player-head">
            <span className="audio-player-title">{displayTitle}</span>
            <span className="audio-player-time">
              {formatAudioTime(currentTime)} / {formatAudioTime(displayDuration)}
            </span>
          </div>

          <div
            ref={waveformRef}
            className="audio-player-waveform"
            role="slider"
            tabIndex={hasSource ? 0 : -1}
            aria-label="Позиция аудио"
            aria-valuemin={0}
            aria-valuemax={Math.max(Math.round(displayDuration), 0)}
            aria-valuenow={Math.round(currentTime)}
            onPointerDown={startSeek}
            onKeyDown={seekByKeyboard}
          >
            <div className="audio-player-waveform-bars" aria-hidden="true">
              {bars.map((bar, index) => {
                const barProgress = bars.length <= 1 ? 1 : index / (bars.length - 1);
                return (
                  <span
                    className={barProgress <= progress ? "is-filled" : ""}
                    key={`${index}-${bar.toFixed(3)}`}
                    style={{ "--audio-bar-height": `${Math.round(8 + bar * 28)}px` } as CSSProperties}
                  />
                );
              })}
            </div>
            <span className="audio-player-progress-dot" style={{ left: `${progress * 100}%` }} aria-hidden="true" />
          </div>

          <div className="audio-player-controls">
            <button
              className="audio-player-stop"
              disabled={!hasSource || (currentTime === 0 && !isPlaying)}
              type="button"
              onClick={stopPlayback}
              aria-label="Остановить и вернуться в начало"
            >
              <Square size={13} aria-hidden="true" />
              <span>Стоп</span>
            </button>
            <select
              className="audio-player-speed"
              aria-label="Скорость воспроизведения"
              value={playbackRate}
              onChange={changeSpeed}
              disabled={!hasSource}
            >
              {PLAYBACK_SPEEDS.map((speed) => (
                <option key={speed} value={speed}>
                  {speed}x
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!hasSource ? <figcaption>Аудиофайл пока недоступен.</figcaption> : null}
      {hasSource && errorMessage ? <figcaption>{errorMessage}</figcaption> : null}
      {hasSource && caption && !compact ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

function formatAudioTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function extractWaveformBars(audioBuffer: AudioBuffer, barCount: number) {
  const channelData = audioBuffer.getChannelData(0);
  const segmentSize = Math.max(1, Math.floor(channelData.length / barCount));
  const rawBars: number[] = [];

  for (let index = 0; index < barCount; index += 1) {
    const start = index * segmentSize;
    const end = Math.min(start + segmentSize, channelData.length);
    const step = Math.max(1, Math.floor((end - start) / 80));
    let sum = 0;
    let samples = 0;

    for (let cursor = start; cursor < end; cursor += step) {
      sum += Math.abs(channelData[cursor] ?? 0);
      samples += 1;
    }

    rawBars.push(samples > 0 ? sum / samples : 0);
  }

  const peak = Math.max(...rawBars, 0.01);
  return rawBars.map((bar) => Math.max(0.16, Math.min(1, bar / peak)));
}

function buildFallbackBars(seed: string, count: number) {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }

  return Array.from({ length: count }, (_, index) => {
    state = Math.imul(state ^ (index + 1), 2246822519);
    const noise = ((state >>> 0) % 1000) / 1000;
    const wave = (Math.sin(index * 0.68) + 1) / 2;
    const envelope = 0.55 + 0.35 * Math.sin((Math.PI * index) / Math.max(count - 1, 1));
    return Math.max(0.18, Math.min(1, (0.32 + noise * 0.5 + wave * 0.28) * envelope));
  });
}
