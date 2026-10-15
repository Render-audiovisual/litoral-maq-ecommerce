export const WELCOME_POPUP_DELAY_MS = 20_000;

/** Loading time counts toward the delay; do not restart it after hydration. */
export function welcomePopupDelay(pageElapsedMs: number) {
  const elapsed = Number.isFinite(pageElapsedMs) ? Math.max(0, pageElapsedMs) : 0;
  return Math.max(0, WELCOME_POPUP_DELAY_MS - elapsed);
}
