"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  SPEED_STEPS,
  audioProgress,
  buildFallbackBars,
  extractWaveformBars,
  formatPlaybackRate,
} from "./audio-player.helpers";

const AUDIO_PLAY_EVENT = "ecoplatform-audio-player:play";

type UseAudioPlayerParams = {
  sourceUrl?: string | null;
  title?: string | null;
  durationSeconds?: number | null;
  compact: boolean;
};

type WindowWithLegacyAudioContext = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export function useAudioPlayer({ sourceUrl, title, durationSeconds, compact }: UseAudioPlayerParams) {
  const reactId = useId();
  const playerId = useMemo(() => `audio-${reactId.replace(/:/g, "")}`, [reactId]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const playbackRate = SPEED_STEPS[speedIndex] ?? 1;
  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;
  const barCount = compact ? 32 : 44;
  const waveformSeed = `${title ?? ""}|${sourceUrl ?? ""}|${durationSeconds ?? ""}`;
  const fallbackBars = useMemo(() => buildFallbackBars(waveformSeed, barCount), [barCount, waveformSeed]);
  const [bars, setBars] = useState(fallbackBars);
  const displayTitle = title?.trim() || "Аудиоверсия";
  const displayDuration = duration > 0 ? duration : (durationSeconds ?? 0);
  const progress = audioProgress(currentTime, displayDuration);
  const hasSource = Boolean(sourceUrl);
  const speedLabel = formatPlaybackRate(playbackRate);

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
    audio.load();
    audio.playbackRate = playbackRateRef.current;
    setCurrentTime(0);
    setDuration(durationSeconds ?? 0);
    setIsPlaying(false);
    setErrorMessage(null);
  }, [durationSeconds, sourceUrl]);

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

  const togglePlayback = useCallback(async () => {
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
  }, [playbackRate, playerId, sourceUrl]);

  const cycleSpeed = useCallback(() => {
    setSpeedIndex((prev) => {
      const next = (prev + 1) % SPEED_STEPS.length;
      if (audioRef.current) audioRef.current.playbackRate = SPEED_STEPS[next] ?? 1;
      return next;
    });
  }, []);

  const startSeek = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!hasSource || displayDuration <= 0) return;
      event.preventDefault();
      seekToClientX(event.clientX);
      setIsDragging(true);
    },
    [displayDuration, hasSource, seekToClientX],
  );

  const seekByKeyboard = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
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
    },
    [displayDuration, hasSource],
  );

  return {
    audioRef,
    waveformRef,
    displayTitle,
    hasSource,
    isPlaying,
    currentTime,
    displayDuration,
    progress,
    bars,
    speedLabel,
    errorMessage,
    togglePlayback,
    cycleSpeed,
    startSeek,
    seekByKeyboard,
  };
}
