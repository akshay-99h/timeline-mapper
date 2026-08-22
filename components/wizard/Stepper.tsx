"use client";

import { motion } from "motion/react";
import { Check } from "@phosphor-icons/react";
import { useApp, type WizardStep } from "@/lib/store";

export function Stepper() {
  const { step, setStep, data, t } = useApp();
  const steps = [t("stepUpload"), t("stepConfigure"), t("stepPreview"), t("stepGenerate")];

  return (
    <nav aria-label="Progress" className="mx-auto flex w-full max-w-lg items-center">
      {steps.map((label, i) => {
        const state = i < step ? "done" : i === step ? "active" : "todo";
        const reachable = i === 0 || (data != null && i <= step + 1 && i !== 3) || (data != null && i < step);
        return (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <button
              type="button"
              disabled={!reachable || i === step}
              onClick={() => reachable && setStep(i as WizardStep)}
              aria-current={state === "active" ? "step" : undefined}
              className="group flex flex-col items-center gap-1.5 disabled:cursor-default"
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full border text-[12px] font-semibold transition-colors ${
                  state === "done"
                    ? "border-accent bg-accent text-white"
                    : state === "active"
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-elev text-faint"
                }`}
              >
                {state === "done" ? <Check size={13} weight="bold" /> : i + 1}
              </span>
              <span
                className={`text-[11px] font-medium ${
                  state === "active" ? "text-ink" : "text-faint"
                }`}
              >
                {label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <div className="relative mx-2 mb-5 h-px flex-1 overflow-hidden rounded bg-line">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-accent"
                  initial={false}
                  animate={{ width: i < step ? "100%" : "0%" }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
