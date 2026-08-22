"use client";

// The 4-step studio wizard.

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { Stepper } from "@/components/wizard/Stepper";
import { UploadStep } from "@/components/wizard/UploadStep";
import { ConfigureStep } from "@/components/wizard/ConfigureStep";
import { PreviewStep } from "@/components/wizard/PreviewStep";
import { GenerateStep } from "@/components/wizard/GenerateStep";
import { useApp, type WizardStep } from "@/lib/store";

export default function StudioPage() {
  const { step, setStep, data, t } = useApp();
  const reduce = useReducedMotion();

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === " " && step === 2) {
        e.preventDefault();
        window.dispatchEvent(new Event("roamline:toggleplay"));
      } else if (e.key === "ArrowRight" && data && step < 3) {
        setStep((step + 1) as WizardStep);
      } else if (e.key === "ArrowLeft" && step > 0) {
        setStep((step - 1) as WizardStep);
      } else if ((e.key === "g" || e.key === "G") && data) {
        setStep(3);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, data, setStep]);

  const steps = [
    <UploadStep key="upload" />,
    <ConfigureStep key="configure" />,
    <PreviewStep key="preview" />,
    <GenerateStep key="generate" />,
  ];

  return (
    <div className="mx-auto min-h-[100dvh] max-w-[1400px] px-4 pb-28 pt-24 sm:px-8">
      <Stepper />
      <div className="mt-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            {steps[step]}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* floating step navigation */}
      {data && step < 3 && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full border border-line bg-[var(--scrim)] p-2 shadow-xl backdrop-blur-xl">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((step - 1) as WizardStep)}
                className="flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-medium text-dim transition-colors hover:text-ink"
              >
                <ArrowLeft size={14} />
                {t("back")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setStep((step + 1) as WizardStep)}
              className="flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98]"
            >
              {step === 2 ? t("generate") : t("continue")}
              <ArrowRight size={14} weight="bold" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
