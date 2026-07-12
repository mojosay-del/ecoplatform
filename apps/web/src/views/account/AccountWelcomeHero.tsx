"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Circle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { BillingStatus } from "@ecoplatform/shared";
import type { User } from "../../lib/auth";
import { TourHintButton } from "../../components/tour/TourHintButton";
import { COMPANY_TYPE_LABELS, PLATFORM_ROLE_LABELS } from "../../lib/display-labels";
import { AccountAvatarEditor } from "./AccountAvatarEditor";
import { accountItem, accountStagger } from "./account-motion";
import { AccountCompletionCelebration } from "./AccountCompletionCelebration";
import { buildProfileChecks, profileCompletionPercent } from "./profile-completion";

const RING_CIRCUMFERENCE = 251;

export function AccountWelcomeHero({
  billing,
  greeting,
  isPlatformStaff,
  onOpenSubscription,
  user,
}: {
  billing: BillingStatus | null;
  greeting: string;
  isPlatformStaff: boolean;
  onOpenSubscription: () => void;
  user: User | null;
}) {
  const reducedMotion = useReducedMotion();
  const fullName = user ? `${user.firstName} ${user.lastName}` : "Не авторизован";
  const company = billing;
  const profileChecks = buildProfileChecks(user, billing);
  const profileCompletion = profileCompletionPercent(profileChecks);
  const profileComplete = profileCompletion >= 100;

  return (
    <motion.header
      animate="visible"
      className="account-welcome"
      initial={reducedMotion ? false : "hidden"}
      variants={accountStagger}
    >
      <span aria-hidden="true" className="account-welcome-bg" />
      <motion.div variants={accountItem}>
        <AccountAvatarEditor />
      </motion.div>
      <div className="account-welcome-info">
        <motion.span className="account-welcome-hi" variants={accountItem}>
          {greeting},
        </motion.span>
        <div className="tour-title-row">
          <motion.h1 className="account-welcome-name" variants={accountItem}>
            {fullName}
          </motion.h1>
          <TourHintButton tour="account" />
        </div>
        <motion.div className="account-welcome-tags" variants={accountItem}>
          {isPlatformStaff ? (
            user?.platformRoles?.map((role) => (
              <span className="account-welcome-tag" key={role}>
                {PLATFORM_ROLE_LABELS[role] ?? role}
              </span>
            ))
          ) : (
            <>
              {company?.organizationName ? (
                <span className="account-welcome-tag">
                  <span className="account-welcome-dot" aria-hidden="true" />
                  {company.organizationName}
                </span>
              ) : null}
              {company?.type ? (
                <span className="account-welcome-tag">{COMPANY_TYPE_LABELS[company.type] ?? company.type}</span>
              ) : null}
            </>
          )}
        </motion.div>
      </div>
      {!isPlatformStaff ? (
        <ProfileCompletionRing
          onOpenSubscription={onOpenSubscription}
          profileChecks={profileChecks}
          profileCompletion={profileCompletion}
          profileComplete={profileComplete}
        />
      ) : null}
    </motion.header>
  );
}

function ProfileCompletionRing({
  onOpenSubscription,
  profileChecks,
  profileComplete,
  profileCompletion,
}: {
  onOpenSubscription: () => void;
  profileChecks: ReturnType<typeof buildProfileChecks>;
  profileComplete: boolean;
  profileCompletion: number;
}) {
  const reducedMotion = useReducedMotion();
  const displayedCompletion = useCountUp(profileCompletion, Boolean(reducedMotion));
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousCompletionRef = useRef<number | null>(null);

  // Празднование срабатывает только на переходе к 100% в рамках сессии
  // (например, после активации подписки) — не при заходе уже со 100%.
  useEffect(() => {
    const previous = previousCompletionRef.current;
    previousCompletionRef.current = profileCompletion;
    if (previous !== null && previous < 100 && profileCompletion >= 100) setCelebrating(true);
  }, [profileCompletion]);

  useEffect(() => {
    if (!checklistOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setChecklistOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setChecklistOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [checklistOpen]);

  return (
    <div className="account-welcome-ring" data-tour="account-ring" ref={containerRef}>
      <button
        aria-expanded={checklistOpen}
        aria-haspopup="dialog"
        aria-label={`Профиль заполнен на ${profileCompletion}%. Открыть чек-лист`}
        className="account-welcome-ring-button"
        onClick={() => setChecklistOpen((open) => !open)}
        type="button"
      >
        <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-hidden="true">
          <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="9" />
          <circle
            className="account-ring-progress"
            cx="48"
            cy="48"
            r="40"
            fill="none"
            stroke="#ffffff"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={Math.round(RING_CIRCUMFERENCE * (1 - displayedCompletion / 100))}
            transform="rotate(-90 48 48)"
          />
          {profileComplete && displayedCompletion >= 100 ? (
            <g>
              <circle cx="48" cy="48" r="20" fill="#ffffff" />
              <path
                d="M40 48l6 6 11-12"
                fill="none"
                stroke="var(--brand)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          ) : (
            <text
              x="48"
              y="48"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="20"
              fontWeight="800"
              fill="#ffffff"
            >
              {displayedCompletion}%
            </text>
          )}
        </svg>
        <span className="account-welcome-ring-label">Профиль заполнен</span>
      </button>
      {checklistOpen ? (
        <div aria-label="Чек-лист заполнения профиля" className="account-ring-checklist" role="dialog">
          <p className="account-ring-checklist-title">
            {profileComplete ? "Профиль заполнен полностью" : "Что осталось заполнить"}
          </p>
          <ul>
            {profileChecks.map((check) => (
              <li className={check.done ? "is-done" : undefined} key={check.key}>
                <span aria-hidden="true" className="account-ring-checklist-mark">
                  {check.done ? <Check size={13} strokeWidth={3} /> : <Circle size={9} strokeWidth={3} />}
                </span>
                <span className="account-ring-checklist-text">
                  {check.label}
                  {!check.done && check.hint ? <small>{check.hint}</small> : null}
                </span>
                {!check.done && check.key === "subscription" ? (
                  <button
                    className="account-ring-checklist-action"
                    onClick={() => {
                      setChecklistOpen(false);
                      onOpenSubscription();
                    }}
                    type="button"
                  >
                    Выбрать
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {celebrating ? <AccountCompletionCelebration onClose={() => setCelebrating(false)} /> : null}
    </div>
  );
}

// Плавный набег процента при появлении кольца (0 → значение). При
// prefers-reduced-motion значение показывается сразу.
function useCountUp(target: number, skip: boolean): number {
  const [value, setValue] = useState(skip ? target : 0);

  useEffect(() => {
    if (skip) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const from = 0;
    const duration = 900;
    function tick(now: number) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [skip, target]);

  return value;
}
