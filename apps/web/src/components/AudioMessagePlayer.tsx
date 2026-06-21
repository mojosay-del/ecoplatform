"use client";

import "./audio-message-player.css";
import { AudioPlayerView } from "./audio-message-player/audio-player-view";
import { useAudioPlayer } from "./audio-message-player/use-audio-player";

type AudioMessagePlayerProps = {
  sourceUrl?: string | null;
  title?: string | null;
  caption?: string | null;
  durationSeconds?: number | null;
  compact?: boolean;
  className?: string;
};

export function AudioMessagePlayer({
  sourceUrl,
  title,
  caption,
  durationSeconds,
  compact = false,
  className = "",
}: AudioMessagePlayerProps) {
  const audioPlayer = useAudioPlayer({ compact, durationSeconds, sourceUrl, title });

  return (
    <AudioPlayerView
      audioRef={audioPlayer.audioRef}
      bars={audioPlayer.bars}
      caption={caption}
      className={className}
      compact={compact}
      currentTime={audioPlayer.currentTime}
      displayDuration={audioPlayer.displayDuration}
      displayTitle={audioPlayer.displayTitle}
      errorMessage={audioPlayer.errorMessage}
      hasSource={audioPlayer.hasSource}
      isPlaying={audioPlayer.isPlaying}
      onCycleSpeed={audioPlayer.cycleSpeed}
      onSeekByKeyboard={audioPlayer.seekByKeyboard}
      onStartSeek={audioPlayer.startSeek}
      onTogglePlayback={audioPlayer.togglePlayback}
      progress={audioPlayer.progress}
      sourceUrl={sourceUrl}
      speedLabel={audioPlayer.speedLabel}
      waveformRef={audioPlayer.waveformRef}
    />
  );
}
