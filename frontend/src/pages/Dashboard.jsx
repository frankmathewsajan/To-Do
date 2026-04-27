import React, { useCallback, useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import AppLayout, { useAppCtx } from "../components/AppLayout";
import ActivityHeatmap from "../components/ActivityHeatmap";
import { api } from "../lib/api";
import { toast } from "sonner";
import { ListChecks, CircleCheck, AlertCircle, Inbox, ArrowRight, Flame, Target } from "lucide-react";
import { format, isPast, parseISO, differenceInCalendarDays } from "date-fns";
import { Button } from "../components/ui/button";

function Inner() {
  const { openCreate, todosRefreshKey } = useAppCtx();
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/todos");
      setTodos(data);
    } catch {
      toast.error("Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load, todosRefreshKey]);

  const stats = useMemo(() => {
    const total = todos.length;
    const completed = todos.filter((t) => t.completed).length;
    const overdue = todos.filter((t) => t.due_date && !t.completed && isPast(parseISO(t.due_date))).length;
    const today = new Date();
    const dueToday = todos.filter((t) => t.due_date && !t.completed && differenceInCalendarDays(parseISO(t.due_date), today) === 0).length;
    return { total, completed, active: total - completed, overdue, dueToday };
  }, [todos]);

  const upcoming = useMemo(() => {
    return todos
      .filter((t) => !t.completed && t.due_date)
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, 5);
  }, [todos]);

  const streak = useMemo(() => {
    // Count consecutive days with at least one completion up to today
    const set = new Set(todos.filter((t) => t.completed).map((t) => format(parseISO(t.updated_at), "yyyy-MM-dd")));
    let s = 0;
    let d = new Date();
    while (set.has(format(d, "yyyy-MM-dd"))) {
      s += 1;
      d.setDate(d.getDate() - 1);
    }
    return s;
  }, [todos]);

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto" data-testid="dashboard-page">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Overview</span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tighter mt-1">Dashboard</h1>
        </div>
        <Button onClick={() => openCreate(null)} className="gap-2" data-testid="dash-new-btn">
          New task
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Inbox} label="Total" value={stats.total} />
        <StatCard icon={ListChecks} label="Active" value={stats.active} accent />
        <StatCard icon={CircleCheck} label="Completed" value={stats.completed} />
        <StatCard icon={AlertCircle} label="Overdue" value={stats.overdue} danger />
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="md:col-span-2 border border-border rounded-lg bg-card p-6"
          data-testid="heatmap-card"
        >
          <ActivityHeatmap todos={todos} days={84} />
        </motion.div>
        <div className="space-y-4">
          <div className="border border-border rounded-lg bg-card p-6" data-testid="streak-card">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.2em] font-bold mb-2">
              <Flame className="h-3.5 w-3.5" /> Streak
            </div>
            <div className="text-3xl font-bold tracking-tight">{streak}<span className="text-muted-foreground text-base font-medium"> {streak === 1 ? "day" : "days"}</span></div>
            <p className="text-xs text-muted-foreground mt-1">Consecutive days with completions</p>
          </div>
          <div className="border border-border rounded-lg bg-card p-6" data-testid="duetoday-card">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.2em] font-bold mb-2">
              <Target className="h-3.5 w-3.5" /> Due today
            </div>
            <div className="text-3xl font-bold tracking-tight">{stats.dueToday}</div>
            <p className="text-xs text-muted-foreground mt-1">Tasks needing attention today</p>
          </div>
        </div>
      </div>

      <div className="border border-border rounded-lg bg-card p-6" data-testid="upcoming-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold tracking-tight">Upcoming tasks</h3>
          <Link to="/tasks" className="text-xs text-primary hover:underline flex items-center gap-1">
            See all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing scheduled. Your calendar is clear.</p>
        ) : (
          <div className="divide-y divide-border">
            {upcoming.map((t) => {
              const overdue = isPast(parseISO(t.due_date));
              return (
                <div key={t.id} className="flex items-center justify-between py-3 gap-4">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{t.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.category} · {t.priority}</p>
                  </div>
                  <span className={`text-xs font-mono ${overdue ? "text-red-500" : "text-muted-foreground"}`}>
                    {format(parseISO(t.due_date), "MMM d")}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent, danger }) {
  return (
    <div className={`border border-border rounded-lg bg-card p-5 ${accent ? "ring-1 ring-primary/20" : ""}`} data-testid={`stat-${label.toLowerCase()}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${danger ? "text-red-500" : accent ? "text-primary" : "text-muted-foreground"}`} />
      </div>
      <div className={`text-3xl font-bold tracking-tight ${danger && value > 0 ? "text-red-500" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

export default function Dashboard() {
  return (<AppLayout><Inner /></AppLayout>);
}
