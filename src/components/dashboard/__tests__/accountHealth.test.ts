import { describe, expect, it } from "vitest";
import { deriveAccountHealth, didLosePaidPlan, findBestHealthyAccount, formatLastCheckedAt } from "@/components/dashboard/accountHealth";
import { makeAccount } from "@/test/helpers";
import type { QuotaInfo } from "@/lib/types";

function makeQuota(overrides: Partial<QuotaInfo> = {}): QuotaInfo {
  return {
    email: "demo@example.com",
    planType: "plus",
    primaryUsedPercent: 20,
    primaryResetsAt: null,
    primaryWindowMins: 300,
    secondaryUsedPercent: null,
    secondaryResetsAt: null,
    secondaryWindowMins: null,
    creditsBalance: null,
    error: null,
    ...overrides,
  };
}

describe("accountHealth", () => {
  it("treats losing a paid plan as a downgrade", () => {
    expect(didLosePaidPlan("plus", "free")).toBe(true);
    expect(didLosePaidPlan("business", "unknown")).toBe(true);
    expect(didLosePaidPlan("free", "plus")).toBe(false);
  });

  it("reports auth errors as attention-required", () => {
    const health = deriveAccountHealth({
      account: makeAccount({ authMethod: "oauth" }),
      quota: makeQuota({ error: "OAuth 登录失效" }),
      pollIntervalMs: 300_000,
      warningThreshold: 80,
      exhaustThreshold: 95,
    });

    expect(health.kind).toBe("auth_error");
    expect(health.autoHandleEligible).toBe(true);
  });

  it("reports stale data when quota has not been refreshed recently", () => {
    const now = Date.UTC(2026, 3, 27, 8, 0, 0);
    const health = deriveAccountHealth({
      account: makeAccount(),
      quota: makeQuota(),
      lastCheckedAt: now - 11 * 60 * 1000,
      pollIntervalMs: 300_000,
      warningThreshold: 80,
      exhaustThreshold: 95,
      now,
    });

    expect(health.kind).toBe("stale");
  });

  it("prefers a healthy paid account when selecting an automatic fallback", () => {
    const now = Date.UTC(2026, 3, 27, 8, 0, 0);
    const accounts = [
      makeAccount({ id: "active", name: "Active" }),
      makeAccount({ id: "free", name: "Free Backup" }),
      makeAccount({ id: "plus", name: "Plus Backup" }),
    ];

    const selected = findBestHealthyAccount({
      accounts,
      quotas: {
        active: makeQuota({ primaryUsedPercent: 98 }),
        free: makeQuota({ planType: "free", primaryUsedPercent: 10 }),
        plus: makeQuota({ planType: "plus", primaryUsedPercent: 25 }),
      },
      activeAccountId: "active",
      lastCheckedAt: {
        active: now,
        free: now,
        plus: now,
      },
      downgradeEvents: {},
      pollIntervalMs: 300_000,
      warningThreshold: 80,
      exhaustThreshold: 95,
      preferPaidPlan: true,
      now,
    });

    expect(selected).toBe("plus");
  });

  it("formats last checked timestamps for recent refreshes", () => {
    const now = Date.UTC(2026, 3, 27, 8, 0, 0);
    expect(formatLastCheckedAt(now - 30_000, now)).toBe("刚刚更新");
    expect(formatLastCheckedAt(now - 5 * 60 * 1000, now)).toBe("5 分钟前");
  });
});
