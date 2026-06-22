"use client";

import BackIcon from "@animated-color-icons/lucide-react/ArrowLeftCircle";
import dynamic from "next/dynamic";
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
import type { IconsaxLottieIconProps, LottieNavIconKey } from "./iconsax-lottie-icon";

type AnimatedLucideIconProps = SVGProps<SVGSVGElement> & {
  color?: string;
  label?: string;
  primaryColor?: string;
  secondaryColor?: string;
  size?: number | string;
  strokeWidth?: number | string;
};

type AnimatedLucideIconComponent = ForwardRefExoticComponent<AnimatedLucideIconProps & RefAttributes<SVGSVGElement>>;

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

const NAV_ICON_COMPONENTS: Record<Exclude<AnimatedIconKey, LottieNavIconKey>, AnimatedLucideIconComponent> = {
  back: BackIcon,
};

const LOTTIE_NAV_ICON_KEYS: ReadonlySet<string> = new Set<LottieNavIconKey>([
  "admin",
  "analytics-map",
  "arrow-up",
  "calculator",
  "data-privacy",
  "docs",
  "education",
  "forum",
  "hide-menu",
  "indices",
  "knowledge",
  "like",
  "logout",
  "map",
  "marketplace",
  "news",
  "notifications",
  "password-check",
  "profile",
  "sales-prices",
  "send",
  "sessions",
  "settings",
  "show-menu",
  "sms",
  "sms-notification",
  "sms-star",
  "subscription",
  "support",
]);

const DynamicIconsaxLottieIcon = dynamic<IconsaxLottieIconProps>(
  () => import("./iconsax-lottie-icon").then((module) => module.IconsaxLottieIcon),
  {
    ssr: false,
    loading: () => <span aria-hidden="true" className="eco-nav-icon-lottie" />,
  },
);

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
  const lottieName = isLottieNavIconKey(name) ? name : null;
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

    if (!lottieName || reducedMotion || !playingRef.current || completedRef.current) {
      resetNow();
      return;
    }

    resetAfterCompleteRef.current = true;
  }, [cancelPendingPlay, lottieName, reducedMotion, resetNow]);

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
      {lottieName ? (
        <DynamicIconsaxLottieIcon
          name={lottieName}
          playing={playing}
          reducedMotion={reducedMotion}
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

function isLottieNavIconKey(name: AnimatedIconKey): name is LottieNavIconKey {
  return LOTTIE_NAV_ICON_KEYS.has(name);
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
