import { describe, expect, it } from "vitest";
import { formatBytes, formatPrice, usageRatio } from "@/lib/plans";

describe("plan helpers", () => {
  it("formats storage in binary units", () => {
    expect(formatBytes(0)).toBe("0 o");
    expect(formatBytes(500 * 1024 * 1024)).toBe("500 Mio");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1,5 Mio");
  });

  it("formats monthly prices", () => {
    expect(formatPrice({ monthly_price_cents: 0, per_user: false })).toBe("Gratuit");
    expect(formatPrice({ monthly_price_cents: 500, per_user: false }).replace(/\s/g, " ")).toBe("5 € / mois");
    expect(formatPrice({ monthly_price_cents: 800, per_user: true }).replace(/\s/g, " ")).toBe("8 € / utilisateur / mois");
  });

  it("computes usage ratios with unlimited plans", () => {
    expect(usageRatio(2, 3)).toBeCloseTo(2 / 3);
    expect(usageRatio(5, 3)).toBe(1);
    expect(usageRatio(5, null)).toBe(0);
  });
});
