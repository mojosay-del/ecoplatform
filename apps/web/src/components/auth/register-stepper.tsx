import { Check } from "lucide-react";
import { REGISTER_STEPS, REGISTER_STEP_TOTAL } from "./constants";

export function RegisterStepper({ current }: { current: number }) {
  return (
    <ol className="auth-stepper" aria-label={`Шаг ${current} из ${REGISTER_STEP_TOTAL}`}>
      {REGISTER_STEPS.map((step) => {
        const state = step.n < current ? "done" : step.n === current ? "active" : "upcoming";
        return (
          <li
            key={step.n}
            className={`auth-stepper-item is-${state}`}
            aria-current={state === "active" ? "step" : undefined}
          >
            <span className="auth-stepper-dot">
              {state === "done" ? <Check size={15} strokeWidth={3} aria-hidden="true" /> : step.n}
            </span>
            <span className="auth-stepper-label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
