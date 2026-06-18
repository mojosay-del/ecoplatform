"use client";

import BackIcon from "@animated-color-icons/lucide-react/ArrowLeftCircle";
import DataPrivacyIcon from "@animated-color-icons/lucide-react/ShieldCheck";
import MarketplaceIcon from "@animated-color-icons/lucide-react/Store";
import type { AnimationItem } from "lottie-web";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ForwardRefExoticComponent,
  type RefAttributes,
  type RefObject,
  type SVGProps,
} from "react";
import type { NavIconKey } from "../app-shell-nav";
import adminAnimation from "./iconsax/admin.json";
import arrowCircleRightAnimation from "./iconsax/arrow-circle-right.json";
import arrowUpAnimation from "./iconsax/arrow-up.json";
import calculatorAnimation from "./iconsax/calculator.json";
import docsAnimation from "./iconsax/docs.json";
import educationAnimation from "./iconsax/education.json";
import forumAnimation from "./iconsax/forum.json";
import hideMenuAnimation from "./iconsax/hide-menu.json";
import knowledgeAnimation from "./iconsax/knowledge.json";
import likeAnimation from "./iconsax/like.json";
import logoutAnimation from "./iconsax/logout.json";
import mapAnimation from "./iconsax/map.json";
import newsAnimation from "./iconsax/news.json";
import notificationsAnimation from "./iconsax/notifications.json";
import priceIndicesAnimation from "./iconsax/price-indices.json";
import profileAnimation from "./iconsax/profile.json";
import sendAnimation from "./iconsax/send.json";
import sessionsAnimation from "./iconsax/sessions.json";
import settingsAnimation from "./iconsax/settings.json";
import smsAnimation from "./iconsax/sms.json";
import smsNotificationAnimation from "./iconsax/sms-notification.json";
import smsStarAnimation from "./iconsax/sms-star.json";
import subscriptionAnimation from "./iconsax/subscription.json";
import supportAnimation from "./iconsax/support.json";

type AnimatedLucideIconProps = SVGProps<SVGSVGElement> & {
  color?: string;
  label?: string;
  primaryColor?: string;
  secondaryColor?: string;
  size?: number | string;
  strokeWidth?: number | string;
};

type AnimatedLucideIconComponent = ForwardRefExoticComponent<AnimatedLucideIconProps & RefAttributes<SVGSVGElement>>;

type LottieAnimationData = object;
type AnimatedIconKey =
  | NavIconKey
  | "arrow-up"
  | "hide-menu"
  | "like"
  | "send"
  | "show-menu"
  | "sms"
  | "sms-notification"
  | "sms-star"
  | "support";
type LottieNavIconKey =
  | "admin"
  | "arrow-up"
  | "calculator"
  | "docs"
  | "education"
  | "forum"
  | "hide-menu"
  | "indices"
  | "knowledge"
  | "like"
  | "logout"
  | "map"
  | "news"
  | "notifications"
  | "profile"
  | "send"
  | "sessions"
  | "settings"
  | "show-menu"
  | "sms"
  | "sms-notification"
  | "sms-star"
  | "subscription"
  | "support";
type LottieNavIconConfig = {
  animationData: LottieAnimationData;
  playbackSpeed?: number;
  startFrame?: number;
};

const PRICE_INDICES_ANIMATION_START_FRAME = 0;
const PRICE_INDICES_ANIMATION_SPEED = 1.45;

const NAV_ICON_COMPONENTS: Record<Exclude<AnimatedIconKey, LottieNavIconKey>, AnimatedLucideIconComponent> = {
  back: BackIcon,
  "data-privacy": DataPrivacyIcon,
  marketplace: MarketplaceIcon,
};

const LOTTIE_NAV_ICONS: Record<LottieNavIconKey, LottieNavIconConfig> = {
  admin: { animationData: adminAnimation },
  "arrow-up": { animationData: arrowUpAnimation },
  calculator: { animationData: calculatorAnimation },
  docs: { animationData: docsAnimation },
  education: { animationData: educationAnimation },
  forum: { animationData: forumAnimation },
  "hide-menu": { animationData: hideMenuAnimation },
  indices: {
    animationData: priceIndicesAnimation,
    playbackSpeed: PRICE_INDICES_ANIMATION_SPEED,
    startFrame: PRICE_INDICES_ANIMATION_START_FRAME,
  },
  knowledge: { animationData: knowledgeAnimation },
  like: { animationData: likeAnimation },
  logout: { animationData: logoutAnimation },
  map: { animationData: mapAnimation },
  news: { animationData: newsAnimation },
  notifications: { animationData: notificationsAnimation },
  profile: { animationData: profileAnimation },
  send: { animationData: sendAnimation },
  sessions: { animationData: sessionsAnimation },
  settings: { animationData: settingsAnimation },
  "show-menu": { animationData: arrowCircleRightAnimation },
  sms: { animationData: smsAnimation },
  "sms-notification": { animationData: smsNotificationAnimation },
  "sms-star": { animationData: smsStarAnimation },
  subscription: { animationData: subscriptionAnimation },
  support: { animationData: supportAnimation },
};

export type AnimatedNavIconHandle = {
  play: () => void;
  reset: () => void;
};

type AnimatedNavIconProps = {
  className?: string;
  name: AnimatedIconKey;
  size?: number;
};

export const AnimatedNavIcon = forwardRef<AnimatedNavIconHandle, AnimatedNavIconProps>(function AnimatedNavIcon(
  { className, name, size = 21 },
  ref,
) {
  const [playing, setPlaying] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const lottieIcon = isLottieNavIconKey(name) ? LOTTIE_NAV_ICONS[name] : null;
  const completedRef = useRef(false);
  const pendingPlayFrameRef = useRef<number | null>(null);
  const playingRef = useRef(playing);
  const resetAfterCompleteRef = useRef(false);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const cancelPendingPlay = useCallback(() => {
    if (pendingPlayFrameRef.current === null) return;
    window.cancelAnimationFrame(pendingPlayFrameRef.current);
    pendingPlayFrameRef.current = null;
  }, []);

  const resetNow = useCallback(() => {
    resetAfterCompleteRef.current = false;
    completedRef.current = false;
    playingRef.current = false;
    setPlaying(false);
  }, []);

  const reset = useCallback(() => {
    cancelPendingPlay();

    if (!lottieIcon || reducedMotion || !playingRef.current || completedRef.current) {
      resetNow();
      return;
    }

    resetAfterCompleteRef.current = true;
  }, [cancelPendingPlay, lottieIcon, reducedMotion, resetNow]);

  const play = useCallback(() => {
    if (reducedMotion) return;
    cancelPendingPlay();
    completedRef.current = false;
    resetAfterCompleteRef.current = false;
    playingRef.current = false;
    setPlaying(false);
    pendingPlayFrameRef.current = window.requestAnimationFrame(() => {
      pendingPlayFrameRef.current = null;
      playingRef.current = true;
      setPlaying(true);
    });
  }, [cancelPendingPlay, reducedMotion]);

  const handleAnimationComplete = useCallback(() => {
    completedRef.current = true;

    if (!resetAfterCompleteRef.current) return;
    resetNow();
  }, [resetNow]);

  useEffect(() => {
    return cancelPendingPlay;
  }, [cancelPendingPlay]);

  useEffect(() => {
    if (reducedMotion) resetNow();
  }, [reducedMotion, resetNow]);

  useImperativeHandle(ref, () => ({ play, reset }), [play, reset]);

  const style = { "--eco-nav-icon-size": `${size}px` } as CSSProperties;

  return (
    <span
      aria-hidden="true"
      className={`eco-nav-icon al-icon-wrapper ${className ?? ""}`}
      data-icon-name={name}
      data-playing={playing ? "true" : undefined}
      style={style}
    >
      {lottieIcon ? (
        <IconsaxLottieIcon
          animationData={lottieIcon.animationData}
          playing={playing}
          playbackSpeed={lottieIcon.playbackSpeed ?? 1}
          reducedMotion={reducedMotion}
          startFrame={lottieIcon.startFrame ?? 0}
          onComplete={handleAnimationComplete}
        />
      ) : (
        <LucideNavIcon name={name as Exclude<AnimatedIconKey, LottieNavIconKey>} size={size} />
      )}
    </span>
  );
});

type ActionIconProps = {
  className?: string;
  size?: number;
};

export const HideMenuIcon = forwardRef<AnimatedNavIconHandle, ActionIconProps>(function HideMenuIcon(
  { className, size = 22 },
  ref,
) {
  return <AnimatedNavIcon className={className} name="hide-menu" ref={ref} size={size} />;
});

export const ShowMenuIcon = forwardRef<AnimatedNavIconHandle, ActionIconProps>(function ShowMenuIcon(
  { className, size = 22 },
  ref,
) {
  return <AnimatedNavIcon className={className} name="show-menu" ref={ref} size={size} />;
});

export const ArrowUpActionIcon = forwardRef<AnimatedNavIconHandle, ActionIconProps>(function ArrowUpActionIcon(
  { className, size = 19 },
  ref,
) {
  return <AnimatedNavIcon className={className} name="arrow-up" ref={ref} size={size} />;
});

export const LikeActionIcon = forwardRef<AnimatedNavIconHandle, ActionIconProps>(function LikeActionIcon(
  { className, size = 19 },
  ref,
) {
  return <AnimatedNavIcon className={className} name="like" ref={ref} size={size} />;
});

export const SendActionIcon = forwardRef<AnimatedNavIconHandle, ActionIconProps>(function SendActionIcon(
  { className, size = 19 },
  ref,
) {
  return <AnimatedNavIcon className={className} name="send" ref={ref} size={size} />;
});

export const SupportTopbarIcon = forwardRef<AnimatedNavIconHandle, ActionIconProps>(function SupportTopbarIcon(
  { className, size = 26 },
  ref,
) {
  return <AnimatedNavIcon className={className} name="support" ref={ref} size={size} />;
});

function LucideNavIcon({ name, size }: { name: Exclude<AnimatedIconKey, LottieNavIconKey>; size: number }) {
  const Icon = NAV_ICON_COMPONENTS[name];

  return (
    <Icon aria-hidden="true" className="eco-nav-icon-svg" focusable="false" label="" size={size} strokeWidth={2} />
  );
}

function IconsaxLottieIcon({
  animationData,
  onComplete,
  playing,
  playbackSpeed,
  reducedMotion,
  startFrame,
}: {
  animationData: LottieAnimationData;
  onComplete: () => void;
  playing: boolean;
  playbackSpeed: number;
  reducedMotion: boolean;
  startFrame: number;
}) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const animationRef = useRef<AnimationItem | null>(null);
  const onCompleteRef = useRef(onComplete);
  const playingRef = useRef(playing);
  const reducedMotionRef = useRef(reducedMotion);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let disposed = false;
    let removeCompleteListener: (() => void) | null = null;

    void import("lottie-web").then(({ default: lottie }) => {
      if (disposed || !containerRef.current) return;

      const animation = lottie.loadAnimation({
        animationData: cloneLottieAnimationData(animationData),
        autoplay: false,
        container: containerRef.current,
        loop: false,
        renderer: "svg",
        rendererSettings: {
          className: "eco-nav-icon-lottie-svg",
          focusable: false,
          preserveAspectRatio: "xMidYMid meet",
        },
      });

      removeCompleteListener = animation.addEventListener("complete", () => onCompleteRef.current());
      animation.setSubframe(false);
      animation.setSpeed(playbackSpeed);
      resetLottieAnimation(animation, startFrame);
      animationRef.current = animation;

      if (playingRef.current && !reducedMotionRef.current) {
        playLottieAnimation(animation, startFrame);
      }
    });

    return () => {
      disposed = true;
      removeCompleteListener?.();
      animationRef.current?.destroy();
      animationRef.current = null;
      container.textContent = "";
    };
  }, [animationData, playbackSpeed, startFrame]);

  useEffect(() => {
    const animation = animationRef.current;
    if (!animation) return;

    if (reducedMotion || !playing) {
      resetLottieAnimation(animation, startFrame);
      return;
    }

    playLottieAnimation(animation, startFrame);
  }, [playing, reducedMotion, startFrame]);

  return <span aria-hidden="true" className="eco-nav-icon-lottie" ref={containerRef} />;
}

function isLottieNavIconKey(name: AnimatedIconKey): name is LottieNavIconKey {
  return name in LOTTIE_NAV_ICONS;
}

function playLottieAnimation(animation: AnimationItem, startFrame: number) {
  animation.goToAndPlay(startFrame, true);
}

function resetLottieAnimation(animation: AnimationItem, startFrame: number) {
  animation.goToAndStop(startFrame, true);
}

function cloneLottieAnimationData(animationData: LottieAnimationData): LottieAnimationData {
  if (typeof structuredClone === "function") {
    return structuredClone(animationData);
  }

  return JSON.parse(JSON.stringify(animationData)) as LottieAnimationData;
}

export function useAnimatedNavIconPlayback(ref: RefObject<AnimatedNavIconHandle | null>) {
  const play = useCallback(() => ref.current?.play(), [ref]);
  const reset = useCallback(() => ref.current?.reset(), [ref]);

  return {
    onBlur: reset,
    onFocus: play,
    onMouseEnter: play,
    onMouseLeave: reset,
  };
}

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);

    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reducedMotion;
}
