"use client";

import BackIcon from "@animated-color-icons/lucide-react/ArrowLeftCircle";
import DataPrivacyIcon from "@animated-color-icons/lucide-react/ShieldCheck";
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
type LottieAnimationModule = { default: LottieAnimationData };
type AnimatedIconKey =
  | NavIconKey
  | "arrow-up"
  | "hide-menu"
  | "like"
  | "password-check"
  | "send"
  | "show-menu"
  | "sms"
  | "sms-notification"
  | "sms-star"
  | "support";
type LottieNavIconKey =
  | "admin"
  | "analytics-map"
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
  | "marketplace"
  | "news"
  | "notifications"
  | "password-check"
  | "profile"
  | "sales-prices"
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
  loadAnimationData: () => Promise<LottieAnimationData>;
  playbackSpeed?: number;
  startFrame?: number;
};

const PRICE_INDICES_ANIMATION_START_FRAME = 0;
const PRICE_INDICES_ANIMATION_SPEED = 1.45;

const NAV_ICON_COMPONENTS: Record<Exclude<AnimatedIconKey, LottieNavIconKey>, AnimatedLucideIconComponent> = {
  back: BackIcon,
  "data-privacy": DataPrivacyIcon,
};

function loadLottieAnimation(loader: () => Promise<LottieAnimationModule>): () => Promise<LottieAnimationData> {
  return () => loader().then((module) => module.default);
}

const LOTTIE_NAV_ICONS: Record<LottieNavIconKey, LottieNavIconConfig> = {
  admin: { loadAnimationData: loadLottieAnimation(() => import("./iconsax/admin.json")) },
  "analytics-map": { loadAnimationData: loadLottieAnimation(() => import("./iconsax/analytics-map.json")) },
  "arrow-up": { loadAnimationData: loadLottieAnimation(() => import("./iconsax/arrow-up.json")) },
  calculator: { loadAnimationData: loadLottieAnimation(() => import("./iconsax/calculator.json")) },
  docs: { loadAnimationData: loadLottieAnimation(() => import("./iconsax/docs.json")) },
  education: { loadAnimationData: loadLottieAnimation(() => import("./iconsax/education.json")) },
  forum: { loadAnimationData: loadLottieAnimation(() => import("./iconsax/forum.json")) },
  "hide-menu": { loadAnimationData: loadLottieAnimation(() => import("./iconsax/hide-menu.json")) },
  indices: {
    loadAnimationData: loadLottieAnimation(() => import("./iconsax/price-indices.json")),
    playbackSpeed: PRICE_INDICES_ANIMATION_SPEED,
    startFrame: PRICE_INDICES_ANIMATION_START_FRAME,
  },
  knowledge: { loadAnimationData: loadLottieAnimation(() => import("./iconsax/knowledge.json")) },
  like: { loadAnimationData: loadLottieAnimation(() => import("./iconsax/like.json")) },
  logout: { loadAnimationData: loadLottieAnimation(() => import("./iconsax/logout.json")) },
  map: { loadAnimationData: loadLottieAnimation(() => import("./iconsax/map.json")) },
  marketplace: { loadAnimationData: loadLottieAnimation(() => import("./iconsax/marketplace.json")) },
  news: { loadAnimationData: loadLottieAnimation(() => import("./iconsax/news.json")) },
  notifications: { loadAnimationData: loadLottieAnimation(() => import("./iconsax/notifications.json")) },
  "password-check": { loadAnimationData: loadLottieAnimation(() => import("./iconsax/password-check.json")) },
  profile: { loadAnimationData: loadLottieAnimation(() => import("./iconsax/profile.json")) },
  "sales-prices": { loadAnimationData: loadLottieAnimation(() => import("./iconsax/sales-prices.json")) },
  send: { loadAnimationData: loadLottieAnimation(() => import("./iconsax/send.json")) },
  sessions: { loadAnimationData: loadLottieAnimation(() => import("./iconsax/sessions.json")) },
  settings: { loadAnimationData: loadLottieAnimation(() => import("./iconsax/settings.json")) },
  "show-menu": { loadAnimationData: loadLottieAnimation(() => import("./iconsax/arrow-circle-right.json")) },
  sms: { loadAnimationData: loadLottieAnimation(() => import("./iconsax/sms.json")) },
  "sms-notification": { loadAnimationData: loadLottieAnimation(() => import("./iconsax/sms-notification.json")) },
  "sms-star": { loadAnimationData: loadLottieAnimation(() => import("./iconsax/sms-star.json")) },
  subscription: { loadAnimationData: loadLottieAnimation(() => import("./iconsax/subscription.json")) },
  support: { loadAnimationData: loadLottieAnimation(() => import("./iconsax/support.json")) },
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
          loadAnimationData={lottieIcon.loadAnimationData}
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

export const PasswordCheckIcon = forwardRef<AnimatedNavIconHandle, ActionIconProps>(function PasswordCheckIcon(
  { className, size = 24 },
  ref,
) {
  return <AnimatedNavIcon className={className} name="password-check" ref={ref} size={size} />;
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
  loadAnimationData,
  onComplete,
  playing,
  playbackSpeed,
  reducedMotion,
  startFrame,
}: {
  loadAnimationData: () => Promise<LottieAnimationData>;
  onComplete: () => void;
  playing: boolean;
  playbackSpeed: number;
  reducedMotion: boolean;
  startFrame: number;
}) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const animationRef = useRef<AnimationItem | null>(null);
  const [animationData, setAnimationData] = useState<LottieAnimationData | null>(null);
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
    let disposed = false;
    setAnimationData(null);

    void loadAnimationData()
      .then((data) => {
        if (!disposed) setAnimationData(data);
      })
      .catch(() => {
        if (!disposed) setAnimationData(null);
      });

    return () => {
      disposed = true;
    };
  }, [loadAnimationData]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !animationData) return undefined;

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
