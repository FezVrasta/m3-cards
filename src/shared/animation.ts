// Shared animation-mode resolution: every card in this project exposes the
// same `animation: "auto" | "on" | "off"` config option, where "auto"
// respects the system's prefers-reduced-motion setting and "on" must NOT
// override it (accessibility requirement — reduced motion always wins).
export type AnimationMode = "auto" | "on" | "off";

export const STANDARD_EASING = "cubic-bezier(0.2, 0, 0, 1)";

export function isReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

// Whether motion/transition animation should actually run for the given
// config mode, taking the system's reduced-motion preference into account.
export function shouldAnimate(mode: AnimationMode | undefined): boolean {
  if (isReducedMotion()) return false;
  return (mode ?? "auto") !== "off";
}
