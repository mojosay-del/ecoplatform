"use client";

import type { AnimationItem } from "lottie-web";
import { useEffect, useRef, useState } from "react";

export type LottieNavIconKey =
  | "admin"
  | "analytics-map"
  | "arrow-up"
  | "calculator"
  | "data-privacy"
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
  restFrame?: number;
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
  "data-privacy": { loadAnimationData: loadLottieAnimation(() => import("./iconsax/data-privacy.json")) },
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

const LOTTIE_REST_FRAME_CACHE = new Map<LottieNavIconKey, number>();

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
  const configuredRestFrame = config.restFrame;

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
    let removeDomLoadedListener: (() => void) | null = null;
    let readyFrameHandle: number | null = null;

    void import("lottie-web").then(({ default: lottie }) => {
      if (disposed || !containerRef.current) return;

      const rendererSettings = {
        className: "eco-nav-icon-lottie-svg",
        focusable: false,
        preserveAspectRatio: "xMidYMid meet",
        // Iconsax exports contain After Effects expressions. Production CSP
        // intentionally forbids eval, so we render the exported base keyframes.
        runExpressions: false,
      };

      const animation = lottie.loadAnimation({
        animationData: cloneLottieAnimationData(animationData),
        autoplay: false,
        container: containerRef.current,
        loop: false,
        renderer: "svg",
        rendererSettings,
      });

      const applyReadyState = () => {
        if (disposed || animationRef.current !== animation) return;

        const restFrame = getRestFrame(animation, containerRef.current, name, startFrame, configuredRestFrame);
        resetLottieAnimation(animation, restFrame);

        if (playingRef.current && !reducedMotionRef.current) {
          playLottieAnimation(animation, startFrame);
        }
      };

      const scheduleReadyState = () => {
        if (readyFrameHandle !== null) {
          window.cancelAnimationFrame(readyFrameHandle);
        }

        readyFrameHandle = window.requestAnimationFrame(() => {
          readyFrameHandle = null;
          applyReadyState();
        });
      };

      removeCompleteListener = animation.addEventListener("complete", () => onCompleteRef.current());
      removeDomLoadedListener = animation.addEventListener("DOMLoaded", scheduleReadyState);
      animation.setSubframe(false);
      animation.setSpeed(playbackSpeed);
      animationRef.current = animation;
      scheduleReadyState();
    });

    return () => {
      disposed = true;
      if (readyFrameHandle !== null) {
        window.cancelAnimationFrame(readyFrameHandle);
      }
      removeCompleteListener?.();
      removeDomLoadedListener?.();
      animationRef.current?.destroy();
      animationRef.current = null;
      container.textContent = "";
    };
  }, [animationData, configuredRestFrame, name, playbackSpeed, startFrame]);

  useEffect(() => {
    const animation = animationRef.current;
    if (!animation) return;

    if (reducedMotion || !playing) {
      resetLottieAnimation(
        animation,
        getRestFrame(animation, containerRef.current, name, startFrame, configuredRestFrame),
      );
      return;
    }

    playLottieAnimation(animation, startFrame);
  }, [configuredRestFrame, name, playing, reducedMotion, startFrame]);

  return <span aria-hidden="true" className="eco-nav-icon-lottie" ref={containerRef} />;
}

function playLottieAnimation(animation: AnimationItem, startFrame: number) {
  animation.goToAndPlay(startFrame, true);
}

function resetLottieAnimation(animation: AnimationItem, startFrame: number) {
  animation.goToAndStop(startFrame, true);
}

function getRestFrame(
  animation: AnimationItem,
  container: HTMLSpanElement | null,
  name: LottieNavIconKey,
  startFrame: number,
  configuredRestFrame: number | undefined,
) {
  if (configuredRestFrame !== undefined) {
    return Math.max(startFrame, configuredRestFrame);
  }

  const cachedRestFrame = LOTTIE_REST_FRAME_CACHE.get(name);
  if (cachedRestFrame !== undefined) {
    return cachedRestFrame;
  }

  const durationInFrames = animation.getDuration(true);
  if (!Number.isFinite(durationInFrames) || durationInFrames <= startFrame) {
    return startFrame;
  }

  const lastFrame = Math.max(startFrame, Math.floor(durationInFrames) - 1);
  for (let frame = lastFrame; frame >= startFrame; frame -= 1) {
    animation.goToAndStop(frame, true);
    if (hasRenderedLottieContent(container)) {
      LOTTIE_REST_FRAME_CACHE.set(name, frame);
      return frame;
    }
  }

  return startFrame;
}

function hasRenderedLottieContent(container: HTMLSpanElement | null): boolean {
  const shapes = container?.querySelectorAll(
    ".eco-nav-icon-lottie-svg path, .eco-nav-icon-lottie-svg rect, .eco-nav-icon-lottie-svg circle, .eco-nav-icon-lottie-svg ellipse, .eco-nav-icon-lottie-svg line, .eco-nav-icon-lottie-svg polyline, .eco-nav-icon-lottie-svg polygon",
  );

  return Array.from(shapes ?? []).some(isVisibleLottieShape);
}

function isVisibleLottieShape(shape: Element): boolean {
  if (isTechnicalSvgShape(shape)) return false;

  const styles = window.getComputedStyle(shape);
  if (styles.display === "none" || styles.visibility === "hidden" || Number(styles.opacity) === 0) {
    return false;
  }

  const box = shape.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

function isTechnicalSvgShape(shape: Element): boolean {
  let parent = shape.parentElement;

  while (parent) {
    const tagName = parent.tagName.toLowerCase();
    if (
      tagName === "defs" ||
      tagName === "clippath" ||
      tagName === "mask" ||
      tagName === "symbol" ||
      tagName === "pattern" ||
      tagName === "lineargradient" ||
      tagName === "radialgradient" ||
      tagName === "filter"
    ) {
      return true;
    }

    if (parent.classList.contains("eco-nav-icon-lottie-svg")) {
      return false;
    }

    parent = parent.parentElement;
  }

  return false;
}

function cloneLottieAnimationData(animationData: LottieAnimationData): LottieAnimationData {
  if (typeof structuredClone === "function") {
    return structuredClone(animationData);
  }

  return JSON.parse(JSON.stringify(animationData)) as LottieAnimationData;
}
