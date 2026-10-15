import { describe, expect, it } from "vitest";
import { welcomePopupDelay } from "./welcome-popup-timing";

describe("welcome popup timing", () => {
  it("counts twenty seconds from navigation, including loading", () => {
    expect(welcomePopupDelay(0)).toBe(20_000);
    expect(welcomePopupDelay(8_000)).toBe(12_000);
    expect(welcomePopupDelay(19_500)).toBe(500);
  });
  it("does not add another wait after a slow load", () => {
    expect(welcomePopupDelay(20_000)).toBe(0);
    expect(welcomePopupDelay(35_000)).toBe(0);
  });
  it("handles invalid measurements safely", () => {
    expect(welcomePopupDelay(-100)).toBe(20_000);
    expect(welcomePopupDelay(NaN)).toBe(20_000);
  });
});
