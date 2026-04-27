import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import AppLayout, { useAppCtx } from "../components/AppLayout";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday,
  parseISO, startOfMonth, startOfWeek, eachDayOfInterval
} from "date-fns";

const priorityStyles = {
  high: "bg-red-500/10 text-red-500",
  medium: "bg-amber-500/10 text-amber-500",
  low: "bg-sky-500/10 text-sky-500",
};

function Inner() {
  const { openCreate, refreshTodos, todosRefreshKey } = useAppCtx();
  const [todos, setTodos] = useState([]);
  const [cursor, setCursor] = useState(startOfMonth(new Date()));
  const [selected, setSelected] = useState(new Date());

  const load = useCallback(async () => {
    try { const { data } = await api.get("/todos"); setTodos(data); }
    catch { toast.error("Failed to load"); }
  }, []);
  useEffect(() => { load(); }, [load, todosRefreshKey]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const byDate = useMemo(() => {
    const map = new Map();
    for (const t of todos) {
      if (!t.due_date) continue;
      const key = format(parseISO(t.due_date), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    return map;
  }, [todos]);

  const selectedTodos = useMemo(() => {
    const key = format(selected, "yyyy-MM-dd");
    return byDate.get(key) || [];
  }, [selected, byDate]);

  const toggle = async (t) => {
    const next = !t.completed;
    setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, completed: next } : x)));
    try { await api.patch(`/todos/${t.id}`, { completed: next }); refreshTodos(); }
    catch {
      toast.error("Update failed");
      setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, completed: !next } : x)));
    }
  };

  const newForDate = () => {
    openCreate({
      title: "", description: "", priority: "medium", category: "General", tags: [],
      due_date: selected.toISOString(),
    });
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto" data-testid="calendar-page">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Schedule</span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tighter mt-1">Calendar</h1>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setCursor((c) => addMonths(c, -1))} data-testid="cal-prev"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="font-medium text-sm min-w-[140px] text-center">{format(cursor, "MMMM yyyy")}</span>
          <Button variant="ghost" size="icon" onClick={() => setCursor((c) => addMonths(c, 1))} data-testid="cal-next"><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" className="ml-2" onClick={() => { setCursor(startOfMonth(new Date())); setSelected(new Date()); }} data-testid="cal-today">Today</Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 border border-border rounded-lg bg-card p-3 md:p-5">
          <div className="grid grid-cols-7 text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground mb-2">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
              <div key={d} className="px-2 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const key = format(d, "yyyy-MM-dd");
              const items = byDate.get(key) || [];
              const inMonth = isSameMonth(d, cursor);
              const isSel = isSameDay(d, selected);
              return (
                <button
                  key={key}
                  onClick={() => setSelected(d)}
                  data-testid={`cal-day-${key}`}
                  className={`min-h-[72px] p-2 text-left rounded-md border transition-all ${
                    isSel ? "border-primary bg-primary/5" : "border-transparent hover:border-border hover:bg-secondary/40"
                  } ${!inMonth ? "opacity-40" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium ${isToday(d) ? "text-primary font-bold" : "text-foreground"}`}>
                      {format(d, "d")}
                    </span>
                    {items.length > 0 && <span className="text-[10px] font-mono text-muted-foreground">{items.length}</span>}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {items.slice(0, 2).map((t) => (
                      <div key={t.id} className={`text-[10px] truncate rounded px-1 py-0.5 ${priorityStyles[t.priority]} ${t.completed ? "line-through opacity-60" : ""}`}>
                        {t.title}
                      </div>
                    ))}
                    {items.length > 2 && <div className="text-[10px] text-muted-foreground">+{items.length - 2} more</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
          className="border border-border rounded-lg bg-card p-6"
          data-testid="cal-selected-panel"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Selected</p>
              <h3 className="text-xl font-bold tracking-tight">{format(selected, "EEEE, MMM d")}</h3>
            </div>
            <Button size="sm" variant="outline" onClick={newForDate} className="gap-1" data-testid="cal-add-task">
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          {selectedTodos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks for this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedTodos.map((t) => (
                <div key={t.id} className="flex items-start gap-3 p-3 rounded-md border border-border hover:border-primary/20 transition-all">
                  <Checkbox checked={t.completed} onCheckedChange={() => toggle(t)} className="mt-0.5" data-testid={`cal-toggle-${t.id}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium text-sm ${t.completed ? "line-through text-muted-foreground" : ""}`}>{t.title}</p>
                    {t.description && <p className="text-xs text-muted-foreground truncate">{t.description}</p>}
                    <span className={`mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded ${priorityStyles[t.priority]}`}>{t.priority}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

export default function Calendar() {
  return (<AppLayout><Inner /></AppLayout>);
}
