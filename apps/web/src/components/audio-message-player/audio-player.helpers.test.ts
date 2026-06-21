import { describe, expect, it } from "vitest";
import {
  audioBarHeight,
  audioProgress,
  audioTimeOffsetForProgress,
  buildFallbackBars,
  extractWaveformBars,
  formatAudioTime,
  formatPlaybackRate,
} from "./audio-player.helpers";

describe("audio player helpers", () => {
  it("formats playback time", () => {
    expect(formatAudioTime(0)).toBe("0:00");
    expect(formatAudioTime(-1)).toBe("0:00");
    expect(formatAudioTime(Number.NaN)).toBe("0:00");
    expect(formatAudioTime(65.9)).toBe("1:05");
  });

  it("formats playback rates", () => {
    expect(formatPlaybackRate(1)).toBe("1X");
    expect(formatPlaybackRate(1.5)).toBe("1,5X");
    expect(formatPlaybackRate(2)).toBe("2X");
  });

  it("clamps progress and keeps time label inside the track", () => {
    expect(audioProgress(30, 60)).toBe(0.5);
    expect(audioProgress(-10, 60)).toBe(0);
    expect(audioProgress(70, 60)).toBe(1);
    expect(audioProgress(30, 0)).toBe(0);
    expect(audioTimeOffsetForProgress(0.08)).toBe(0);
    expect(audioTimeOffsetForProgress(0.5)).toBe(-50);
    expect(audioTimeOffsetForProgress(0.92)).toBe(-100);
  });

  it("calculates regular and compact waveform bar heights", () => {
    expect(audioBarHeight(0.5, false)).toBe(45);
    expect(audioBarHeight(0.5, true)).toBe(28);
  });

  it("builds deterministic fallback bars in the visual range", () => {
    const bars = buildFallbackBars("episode|source|120", 8);
    expect(bars).toHaveLength(8);
    expect(buildFallbackBars("episode|source|120", 8)).toEqual(bars);
    expect(buildFallbackBars("another|source|120", 8)).not.toEqual(bars);
    expect(bars.every((bar) => bar >= 0.18 && bar <= 1)).toBe(true);
  });

  it("normalizes decoded waveform samples", () => {
    const bars = extractWaveformBars(
      {
        getChannelData: () => Float32Array.from([0, 0.5, -1, 0, 0.25, -0.25]),
      },
      3,
    );

    expect(bars).toEqual([0.5, 1, 0.5]);
  });
});
