"use client";

import type { AnimationItem } from "lottie-web";
import { useEffect, useRef, useState } from "react";

export type LottieNavIconKey =
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

export type IconsaxLottieIconProps = {
  name: LottieNavIconKey;
  onComplete: () => void;
  playing: boolean;
  reducedMotion: boolean;
};

type LottieAnimationData = object;
type LottieAnimationModule = { default: LottieAnimationData };
type LottieNavIconConfig = {
  loadAnimationData: () => Promise<LottieAnimationData>;
  playbackSpeed?: number;
  startFrame?: number;
};

const PRICE_INDICES_ANIMATION_START_FRAME = 0;
const PRICE_INDICES_ANIMATION_SPEED = 1.45;

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

export function IconsaxLottieIcon({ name, onComplete, playing, reducedMotion }: IconsaxLottieIconProps) {
  const config = LOTTIE_NAV_ICONS[name];
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const animationRef = useRef<AnimationItem | null>(null);
  const [animationData, setAnimationData] = useState<LottieAnimationData | null>(null);
  const onCompleteRef = useRef(onComplete);
  const playingRef = useRef(playing);
  const reducedMotionRef = useRef(reducedMotion);
  const playbackSpeed = config.playbackSpeed ?? 1;
  const startFrame = config.startFrame ?? 0;

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

    void config
      .loadAnimationData()
      .then((data) => {
        if (!disposed) setAnimationData(data);
      })
      .catch(() => {
        if (!disposed) setAnimationData(null);
      });

    return () => {
      disposed = true;
    };
  }, [config]);

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
