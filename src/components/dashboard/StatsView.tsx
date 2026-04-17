import { useEffect, useState } from "react";
import { BarChart3, TrendingUp, Loader2, Gauge, Clock, AlertTriangle, DollarSign } from "lucide-react";
import { getDailyStats, getAccountUsageSummary, getHourlyActivity, getConsumptionRates, fetchOpenaiCosts } from "@/lib/tauri";
import { toast } from "@/stores/toastStore";
import { useThemeStore } from "@/stores/themeStore";
import { useUIStore } from "@/stores/uiStore";
import type { CostsSummary } from "@/lib/types";

const COLORS = [
  "#22d3ee", "#34d399", "#f472b6", "#fbbf24", "#a78bfa",
  "#fb923c", "#2dd4bf", "#e879f9", "#4ade80", "#60a5fa",
];

function DailyTrendChart({ data, isLight }: { data: Array<[string, string, number]>; isLight: boolean }) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-neutral-500">
        暂无数据，额度查询后将自动记录
      </div>
    );
  }

  const days = [...new Set(data.map(([, d]) => d))].sort();
  const accounts = [...new Set(data.map(([n]) => n))];
  const byAccount: Record<string, Record<string, number>> = {};
  for (const [name, day, val] of data) {
    if (!byAccount[name]) byAccount[name] = {};
    byAccount[name][day] = val;
  }

  const width = 500;
  const height = 200;
  const padL = 40;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const xScale = (i: number) => padL + (days.length > 1 ? (i / (days.length - 1)) * chartW : chartW / 2);
  const yScale = (v: number) => padT + (1 - v / 100) * chartH;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={padL} x2={width - padR} y1={yScale(v)} y2={yScale(v)} stroke={isLight ? "black" : "white"} strokeOpacity={isLight ? 0.08 : 0.06} />
          <text x={padL - 6} y={yScale(v) + 3} textAnchor="end" className="fill-neutral-600 text-[9px]">
            {v}%
          </text>
        </g>
      ))}

      {days.map((d, i) => (
        <text
          key={d}
          x={xScale(i)}
          y={height - 4}
          textAnchor="middle"
          className="fill-neutral-600 text-[9px]"
        >
          {d.slice(5)}
        </text>
      ))}

      {accounts.map((name, ai) => {
        const color = COLORS[ai % COLORS.length];
        const points = days
          .map((d, i) => {
            const val = byAccount[name]?.[d];
            if (val == null) return null;
            return `${xScale(i)},${yScale(100 - val)}`;
          })
          .filter(Boolean);
        if (points.length < 2) return null;
        return (
          <polyline
            key={name}
            points={points.join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}

      <g>
        {accounts.map((name, ai) => (
          <g key={name} transform={`translate(${padL + ai * 80}, ${padT - 4})`}>
            <circle r={3} fill={COLORS[ai % COLORS.length]} />
            <text x={6} y={3} className="fill-neutral-400 text-[9px]">{name}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function UsageDistribution({ data, isLight }: { data: Array<[string, number]>; isLight: boolean }) {
  if (data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-neutral-500">
        暂无数据
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map(([name, avgUsed], i) => {
        const remaining = Math.max(0, 100 - avgUsed);
        const color = COLORS[i % COLORS.length];
        return (
          <div key={name} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-300">{name}</span>
              <span className="tabular-nums text-neutral-400">
                平均剩余 {remaining.toFixed(0)}%
              </span>
            </div>
            <div className={`h-2 rounded-full ${isLight ? "bg-black/[0.06]" : "bg-white/[0.06]"}`}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${remaining}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HourlyHeatmap({ data, isLight }: { data: Array<[number, number]>; isLight: boolean }) {
  if (data.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center text-sm text-neutral-500">
        暂无数据
      </div>
    );
  }

  const hourMap: Record<number, number> = {};
  for (const [h, c] of data) hourMap[h] = c;
  const maxCount = Math.max(...data.map(([, c]) => c), 1);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-24 gap-1">
        {Array.from({ length: 24 }, (_, h) => {
          const count = hourMap[h] ?? 0;
          const intensity = count / maxCount;
          const bg = isLight
            ? `rgba(6, 182, 212, ${0.08 + intensity * 0.5})`
            : `rgba(6, 182, 212, ${0.06 + intensity * 0.6})`;
          return (
            <div
              key={h}
              className="flex aspect-square items-center justify-center rounded-sm text-[8px]"
              style={{ backgroundColor: bg }}
              title={`${h}:00 — ${count} 次查询`}
            >
              <span className={`tabular-nums ${intensity > 0.5 ? "text-white" : isLight ? "text-neutral-600" : "text-neutral-500"}`}>
                {h}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[9px] text-neutral-500">
        <span>低活跃</span>
        <div className="flex items-center gap-1">
          {[0.1, 0.3, 0.5, 0.7, 0.9].map((v) => (
            <div
              key={v}
              className="h-2 w-4 rounded-sm"
              style={{ backgroundColor: `rgba(6, 182, 212, ${isLight ? 0.08 + v * 0.5 : 0.06 + v * 0.6})` }}
            />
          ))}
        </div>
        <span>高活跃</span>
      </div>
    </div>
  );
}

function ConsumptionPanel({ data }: { data: Array<[string, string, number, number | null]> }) {
  if (data.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center text-sm text-neutral-500">
        暂无数据
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map(([id, name, latestUsed, ratePerHour]) => {
        const remaining = 100 - latestUsed;
        const hoursLeft =
          ratePerHour != null && ratePerHour > 0.01
            ? remaining / ratePerHour
            : null;

        return (
          <div key={id} className="flex items-center gap-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-200">{name}</p>
              <div className="mt-0.5 flex items-center gap-3 text-[11px] text-neutral-500">
                <span>剩余 <span className="tabular-nums text-neutral-300">{remaining.toFixed(0)}%</span></span>
                {ratePerHour != null && (
                  <span>
                    速率 <span className="tabular-nums text-neutral-300">{ratePerHour.toFixed(1)}%/h</span>
                  </span>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right">
              {hoursLeft != null ? (
                <div className={`flex items-center gap-1 ${hoursLeft < 2 ? "text-rose-400" : hoursLeft < 6 ? "text-amber-400" : "text-emerald-400"}`}>
                  {hoursLeft < 2 && <AlertTriangle size={12} />}
                  <span className="text-sm font-semibold tabular-nums">
                    {hoursLeft < 1
                      ? `${Math.round(hoursLeft * 60)}分`
                      : `${hoursLeft.toFixed(1)}时`}
                  </span>
                  <span className="text-[10px] opacity-70">后耗尽</span>
                </div>
              ) : (
                <span className="text-xs text-neutral-600">—</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CostPanel({ costs }: { costs: CostsSummary | null }) {
  if (!costs || costs.buckets.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-neutral-500">
        暂无费用数据，请在设置中配置 Admin Key
      </div>
    );
  }

  const maxDaily = Math.max(...costs.buckets.map((b) => b.totalUsd), 0.001);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-2xl font-bold tabular-nums text-neutral-200">
          ${costs.totalUsd.toFixed(2)}
        </span>
        <span className="text-xs text-neutral-500">
          近 {costs.days} 天总费用
        </span>
      </div>

      <div className="flex items-end gap-1" style={{ height: 80 }}>
        {costs.buckets.map((b) => {
          const h = Math.max(4, (b.totalUsd / maxDaily) * 100);
          const date = new Date(b.startTime * 1000);
          const label = `${date.getMonth() + 1}/${date.getDate()}`;
          return (
            <div
              key={b.startTime}
              className="group relative flex flex-1 flex-col items-center justify-end"
              style={{ height: "100%" }}
            >
              <div
                className="w-full rounded-t bg-gradient-to-t from-primary-600 to-primary-400 transition-all group-hover:from-primary-500 group-hover:to-primary-300"
                style={{ height: `${h}%`, minHeight: 2 }}
                title={`${label}: $${b.totalUsd.toFixed(4)}`}
              />
              <span className="mt-1 text-[7px] tabular-nums text-neutral-600">
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {costs.buckets.some((b) => b.lineItems.length > 0) && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[10px] font-medium text-neutral-500">按类型分布</p>
          {(() => {
            const agg: Record<string, number> = {};
            for (const b of costs.buckets) {
              for (const li of b.lineItems) {
                agg[li.name] = (agg[li.name] ?? 0) + li.usd;
              }
            }
            return Object.entries(agg)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([name, usd]) => (
                <div key={name} className="flex items-center justify-between text-xs">
                  <span className="text-neutral-400">{name}</span>
                  <span className="tabular-nums text-neutral-300">${usd.toFixed(4)}</span>
                </div>
              ));
          })()}
        </div>
      )}
    </div>
  );
}

export function StatsView() {
  const setHeaderSegments = useUIStore((s) => s.setHeaderSegments);
  const clearHeaderSegments = useUIStore((s) => s.clearHeaderSegments);
  const setHeaderActions = useUIStore((s) => s.setHeaderActions);
  const clearHeaderActions = useUIStore((s) => s.clearHeaderActions);
  const [dailyData, setDailyData] = useState<Array<[string, string, number]>>([]);
  const [summaryData, setSummaryData] = useState<Array<[string, number]>>([]);
  const [hourlyData, setHourlyData] = useState<Array<[number, number]>>([]);
  const [ratesData, setRatesData] = useState<Array<[string, string, number, number | null]>>([]);
  const [costsData, setCostsData] = useState<CostsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const isLight = useThemeStore((s) => s.resolvedTheme) === "light";

  const fetchData = async (d: number) => {
    setLoading(true);
    try {
      const [daily, summary, hourly, rates] = await Promise.all([
        getDailyStats(d),
        getAccountUsageSummary(),
        getHourlyActivity(d),
        getConsumptionRates(),
      ]);
      setDailyData(daily);
      setSummaryData(summary);
      setHourlyData(hourly);
      setRatesData(rates);
      fetchOpenaiCosts(d).then(setCostsData).catch(() => {});
    } catch (e) {
      toast("error", `加载统计数据失败: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(days);
  }, [days]);

  useEffect(() => {
    setHeaderSegments([
      {
        id: "stats-days",
        options: [7, 14, 30].map((d) => ({
          id: `stats-days-${d}`,
          label: `${d}天`,
          active: days === d,
          onClick: () => setDays(d),
        })),
      },
    ]);
  }, [days, setHeaderSegments]);

  useEffect(() => {
    setHeaderActions([
      {
        id: "stats-refresh",
        label: "刷新",
        icon: "refresh",
        onClick: () => fetchData(days),
        loading,
        variant: "ghost",
      },
    ]);
  }, [days, loading, setHeaderActions]);

  useEffect(() => {
    return () => clearHeaderSegments();
  }, [clearHeaderSegments]);

  useEffect(() => {
    return () => clearHeaderActions();
  }, [clearHeaderActions]);

  const allEmpty = !loading && dailyData.length === 0 && summaryData.length === 0 && hourlyData.length === 0 && ratesData.length === 0;

  if (allEmpty && !costsData?.buckets.length) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-medium text-neutral-200">
            <BarChart3 size={18} />
            使用统计
          </h2>
        </div>
        <div className="mt-12 flex flex-col items-center justify-center gap-5">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500/20 to-teal-500/10 backdrop-blur-sm">
            <TrendingUp size={40} className="text-primary-400" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-medium text-neutral-200">暂无统计数据</h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-neutral-500">
              添加账号并完成首次额度查询后，使用趋势、消耗速率、高峰时段等统计数据将自动生成。
            </p>
          </div>
          <div className="mt-2 grid max-w-md grid-cols-3 gap-3 text-center">
            {[
              { icon: "📊", title: "趋势分析", desc: "每日额度剩余折线图" },
              { icon: "⚡", title: "消耗速率", desc: "每小时消耗率 + 耗尽预估" },
              { icon: "🕐", title: "时段分布", desc: "24小时活跃热力图" },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-white/[0.06] bg-surface-1 p-3 shadow-sm shadow-black/20">
                <p className="text-lg">{item.icon}</p>
                <p className="mt-1 text-xs font-medium text-neutral-300">{item.title}</p>
                <p className="mt-0.5 text-[10px] text-neutral-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-medium text-neutral-200">
          <BarChart3 size={18} />
          使用统计
        </h2>
      </div>

      <section className="rounded-xl border border-white/[0.06] bg-surface-1 p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-neutral-300">
          <TrendingUp size={14} />
          每日剩余额度趋势
        </h3>
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 size={20} className="animate-spin text-neutral-500" />
          </div>
        ) : (
          <DailyTrendChart data={dailyData} isLight={isLight} />
        )}
      </section>

      <section className="rounded-xl border border-white/[0.06] bg-surface-1 p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-neutral-300">
          <BarChart3 size={14} />
          近 7 天账号平均使用
        </h3>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 size={20} className="animate-spin text-neutral-500" />
          </div>
        ) : (
          <UsageDistribution data={summaryData} isLight={isLight} />
        )}
      </section>

      <section className="rounded-xl border border-white/[0.06] bg-surface-1 p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-neutral-300">
          <Gauge size={14} />
          消耗速率与耗尽预估
        </h3>
        {loading ? (
          <div className="flex h-20 items-center justify-center">
            <Loader2 size={20} className="animate-spin text-neutral-500" />
          </div>
        ) : (
          <ConsumptionPanel data={ratesData} />
        )}
      </section>

      <section className="rounded-xl border border-white/[0.06] bg-surface-1 p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-neutral-300">
          <Clock size={14} />
          高峰时段分布
        </h3>
        {loading ? (
          <div className="flex h-20 items-center justify-center">
            <Loader2 size={20} className="animate-spin text-neutral-500" />
          </div>
        ) : (
          <HourlyHeatmap data={hourlyData} isLight={isLight} />
        )}
      </section>

      <section className="rounded-xl border border-white/[0.06] bg-surface-1 p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-neutral-300">
          <DollarSign size={14} />
          API 费用追踪
        </h3>
        <CostPanel costs={costsData} />
      </section>
    </div>
  );
}
