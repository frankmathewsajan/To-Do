import React, { useMemo } from "react";
import { format, startOfDay, subDays, eachDayOfInterval, parseISO, differenceInCalendarDays } from "date-fns";

const COLORS = [
  "bg-secondary/60",
  "bg-primary/20",
  "bg-primary/40",
  "bg-primary/70",
  "bg-primary",
];

function levelFor(n, max) {
  if (!n) return 0;
  const r = n / max;
  if (r >= 0.8) return 4;
  if (r >= 0.6) return 3;
  if (r >= 0.4) return 2;
  return 1;
}

function Cell({ day, count, max }) {
  if (!day) return <div className="w-3 h-3" />;
  const lv = levelFor(count, max);
  return (
    <div
      className={`w-3 h-3 rounded-sm ${COLORS[lv]} hover:ring-2 hover:ring-primary/40 transition-all`}
      title={`${format(day, "MMM d, yyyy")} — ${count} completed`}
    />
  );
}

function Legend() {
  return (
    <div className="flex items-center justify-end gap-1 mt-3 text-[10px] text-muted-foreground">
      <span className="mr-1">Less</span>
      {COLORS.map((_, lv) => (
        <div key={`legend-${lv}`} className={`w-3 h-3 rounded-sm ${COLORS[lv]}`} />
      ))}
      <span className="ml-1">More</span>
    </div>
  );
}

function useCompletionCounts(todos, days) {
  const today = startOfDay(new Date());
  return useMemo(() => {
    const map = new Map();
    for (const t of todos) {
      if (!t.completed || !t.updated_at) continue;
      const d = startOfDay(parseISO(t.updated_at));
      if (differenceInCalendarDays(today, d) >= days || d > today) continue;
      const key = format(d, "yyyy-MM-dd");
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [todos, days, today]);
}

function useWeeks(days) {
  const today = startOfDay(new Date());
  const start = subDays(today, days - 1);
  return useMemo(() => {
    const allDays = eachDayOfInterval({ start, end: today });
    const weeks = [];
    let week = new Array(allDays[0].getDay()).fill(null);
    for (const d of allDays) {
      week.push(d);
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }
    return weeks;
  }, [start, today]);
}

export default function ActivityHeatmap({ todos, days = 84 }) {
  const counts = useCompletionCounts(todos, days);
  const weeks = useWeeks(days);
  const max = Math.max(1, ...Array.from(counts.values()));
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);

  return (
    <div data-testid="activity-heatmap">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold tracking-tight">Activity</h3>
        <span className="text-xs text-muted-foreground font-mono">{total} completions · last {days} days</span>
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {weeks.map((wk) => {
          const firstDay = wk.find((d) => d);
          const weekKey = firstDay ? format(firstDay, "yyyy-'w'-MM-dd") : `empty-week-${wk.length}`;
          return (
            <div key={weekKey} className="flex flex-col gap-1">
              {wk.map((d, idx) => {
                const cellKey = d ? format(d, "yyyy-MM-dd") : `${weekKey}-pad-${idx}`;
                const count = d ? (counts.get(format(d, "yyyy-MM-dd")) || 0) : 0;
                return <Cell key={cellKey} day={d} count={count} max={max} />;
              })}
            </div>
          );
        })}
      </div>
      <Legend />
    </div>
  );
}
