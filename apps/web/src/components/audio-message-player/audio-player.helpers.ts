import type { CSSProperties } from "react";

// Скорости перебираются по кругу одной кнопкой: 1 -> 1.5 -> 2 -> снова 1.
export const SPEED_STEPS = [1, 1.5, 2] as const;

export function formatAudioTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatPlaybackRate(value: number) {
  if (value === 1) return "1X";
  if (value === 1.5) return "1,5X";
  return "2X";
}

export function audioProgress(currentTime: number, displayDuration: number) {
  if (displayDuration <= 0) return 0;
  return Math.min(Math.max(currentTime / displayDuration, 0), 1);
}

export function audioTimeOffsetForProgress(progress: number) {
  if (progress <= 0.08) return 0;
  if (progress >= 0.92) return -100;
  return -50;
}

export function audioTimeStyle(progress: number) {
  return {
    "--audio-time-x": `${progress * 100}%`,
    "--audio-time-offset": `${audioTimeOffsetForProgress(progress)}%`,
  } as CSSProperties;
}

export function audioBarHeight(bar: number, compact: boolean) {
  return compact ? Math.round(8 + bar * 40) : Math.round(14 + bar * 62);
}

export function audioBarStyle(bar: number, compact: boolean) {
  return { "--audio-bar-height": `${audioBarHeight(bar, compact)}px` } as CSSProperties;
}

export function extractWaveformBars(audioBuffer: Pick<AudioBuffer, "getChannelData">, barCount: number) {
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

export function buildFallbackBars(seed: string, count: number) {
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
