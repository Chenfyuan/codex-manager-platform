import type { Account, QuotaInfo } from "@/lib/types";

export type AccountHealthKind =
  | "unknown"
  | "healthy"
  | "warning"
  | "exhausted"
  | "auth_error"
  | "downgraded"
  | "stale";

export interface DowngradeEvent {
  fromPlan: string;
  toPlan: string;
  detectedAt: number;
}

export interface AccountHealth {
  kind: AccountHealthKind;
  label: string;
  tone: string;
  detail: string;
  requiresAttention: boolean;
  autoHandleEligible: boolean;
}

interface DeriveAccountHealthParams {
  account: Account;
  quota?: QuotaInfo;
  lastCheckedAt?: number | null;
  pollIntervalMs: number;
  warningThreshold: number;
  exhaustThreshold: number;
  downgrade?: DowngradeEvent | null;
  now?: number;
}

interface FindBestHealthyAccountParams {
  accounts: Account[];
  quotas: Record<string, QuotaInfo>;
  activeAccountId: string | null;
  lastCheckedAt: Record<string, number>;
  downgradeEvents: Record<string, DowngradeEvent>;
  pollIntervalMs: number;
  warningThreshold: number;
  exhaustThreshold: number;
  preferPaidPlan?: boolean;
  now?: number;
}

const STALE_GRACE_MULTIPLIER = 2;
const MIN_STALE_MS = 10 * 60 * 1000;

const paidPlans = new Set(["plus", "pro", "prolite", "business"]);

const healthPriority: Record<AccountHealthKind, number> = {
  healthy: 6,
  warning: 5,
  stale: 4,
  unknown: 3,
  downgraded: 2,
  auth_error: 1,
  exhausted: 0,
};

export function isPaidPlan(planType: string | null | undefined): boolean {
  return paidPlans.has((planType ?? "").toLowerCase());
}

export function didLosePaidPlan(previousPlan: string | null | undefined, nextPlan: string | null | undefined): boolean {
  return isPaidPlan(previousPlan) && !isPaidPlan(nextPlan);
}

export function deriveAccountHealth({
  account,
  quota,
  lastCheckedAt,
  pollIntervalMs,
  warningThreshold,
  exhaustThreshold,
  downgrade,
  now = Date.now(),
}: DeriveAccountHealthParams): AccountHealth {
  if (downgrade) {
    return {
      kind: "downgraded",
      label: "会员降级",
      tone: "text-amber-300 bg-amber-500/15 border-amber-400/30",
      detail: `${planLabel(downgrade.fromPlan)} → ${planLabel(downgrade.toPlan)}`,
      requiresAttention: true,
      autoHandleEligible: true,
    };
  }

  if (quota?.error) {
    const looksLikeCredentialError =
      quota.error.includes("凭证") ||
      quota.error.includes("OAuth") ||
      quota.error.includes("登录") ||
      quota.error.includes("auth");

    return {
      kind: "auth_error",
      label: account.authMethod === "oauth" || looksLikeCredentialError ? "认证异常" : "查询失败",
      tone: "text-rose-300 bg-rose-500/15 border-rose-400/30",
      detail: account.authMethod === "oauth" || looksLikeCredentialError ? "请重新登录或刷新凭证" : quota.error,
      requiresAttention: true,
      autoHandleEligible: true,
    };
  }

  if (quota?.primaryUsedPercent != null) {
    if (quota.primaryUsedPercent >= exhaustThreshold) {
      return {
        kind: "exhausted",
        label: "额度耗尽",
        tone: "text-rose-300 bg-rose-500/15 border-rose-400/30",
        detail: `已使用 ${Math.round(quota.primaryUsedPercent)}%`,
        requiresAttention: true,
        autoHandleEligible: true,
      };
    }

    if (quota.primaryUsedPercent >= warningThreshold) {
      return {
        kind: "warning",
        label: "即将耗尽",
        tone: "text-amber-300 bg-amber-500/15 border-amber-400/30",
        detail: `剩余 ${Math.max(0, Math.round(100 - quota.primaryUsedPercent))}%`,
        requiresAttention: false,
        autoHandleEligible: false,
      };
    }
  }

  const staleMs = Math.max(pollIntervalMs * STALE_GRACE_MULTIPLIER, MIN_STALE_MS);
  if (lastCheckedAt && now - lastCheckedAt > staleMs) {
    return {
      kind: "stale",
      label: "数据过期",
      tone: "text-neutral-400 bg-neutral-500/10 border-neutral-400/20",
      detail: `超过 ${Math.round((now - lastCheckedAt) / 60000)} 分钟未更新`,
      requiresAttention: false,
      autoHandleEligible: false,
    };
  }

  if (quota?.primaryUsedPercent != null || quota?.email || quota?.planType !== "unknown") {
    return {
      kind: "healthy",
      label: "健康",
      tone: "text-emerald-300 bg-emerald-500/15 border-emerald-400/30",
      detail: quota?.primaryUsedPercent != null
        ? `剩余 ${Math.max(0, Math.round(100 - quota.primaryUsedPercent))}%`
        : "状态正常",
      requiresAttention: false,
      autoHandleEligible: false,
    };
  }

  return {
    kind: "unknown",
    label: "待检查",
    tone: "text-neutral-400 bg-neutral-500/10 border-neutral-400/20",
    detail: "尚未获取账号状态",
    requiresAttention: false,
    autoHandleEligible: false,
  };
}

export function shouldAutoHandleHealth(health: AccountHealth): boolean {
  return health.autoHandleEligible;
}

export function findBestHealthyAccount({
  accounts,
  quotas,
  activeAccountId,
  lastCheckedAt,
  downgradeEvents,
  pollIntervalMs,
  warningThreshold,
  exhaustThreshold,
  preferPaidPlan = false,
  now = Date.now(),
}: FindBestHealthyAccountParams): string | null {
  const candidates = accounts
    .filter((account) => account.id !== activeAccountId)
    .map((account) => {
      const quota = quotas[account.id];
      const health = deriveAccountHealth({
        account,
        quota,
        lastCheckedAt: lastCheckedAt[account.id],
        pollIntervalMs,
        warningThreshold,
        exhaustThreshold,
        downgrade: downgradeEvents[account.id],
        now,
      });
      const remaining = quota?.primaryUsedPercent != null ? 100 - quota.primaryUsedPercent : -1;
      const paidPlan = isPaidPlan(quota?.planType);
      return { account, health, remaining, paidPlan };
    })
    .filter(({ health }) => !["auth_error", "downgraded", "exhausted"].includes(health.kind));

  if (candidates.length === 0) return null;

  candidates.sort((left, right) => {
    if (preferPaidPlan && left.paidPlan !== right.paidPlan) {
      return left.paidPlan ? -1 : 1;
    }

    const healthGap = healthPriority[right.health.kind] - healthPriority[left.health.kind];
    if (healthGap !== 0) return healthGap;

    if (left.remaining !== right.remaining) {
      return right.remaining - left.remaining;
    }

    if (left.account.priority !== right.account.priority) {
      return right.account.priority - left.account.priority;
    }

    return left.account.name.localeCompare(right.account.name, "zh-CN");
  });

  return candidates[0]?.account.id ?? null;
}

export function planLabel(planType: string | null | undefined): string {
  switch ((planType ?? "").toLowerCase()) {
    case "pro":
      return "Pro";
    case "plus":
      return "Plus";
    case "prolite":
      return "Pro Lite";
    case "business":
      return "Business";
    case "free":
      return "Free";
    default:
      return "未知";
  }
}

export function formatLastCheckedAt(timestamp?: number | null, now = Date.now()): string {
  if (!timestamp) return "未检查";
  const diffMs = Math.max(0, now - timestamp);
  if (diffMs < 60_000) return "刚刚更新";
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 60) return `${diffMins} 分钟前`;
  const diffHours = Math.round(diffMins / 60);
  return `${diffHours} 小时前`;
}
