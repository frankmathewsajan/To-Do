import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AppLayout, { useAppCtx } from "../components/AppLayout";
import TodoItem from "../components/TodoItem";
import { api } from "../lib/api";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Plus, Search, Inbox } from "lucide-react";

function Inner() {
  const { openCreate, refreshTodos, todosRefreshKey } = useAppCtx();
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/todos");
      setTodos(data);
    } catch { toast.error("Failed to load"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load, todosRefreshKey]);

  const filtered = useMemo(() => {
    let list = todos;
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((t) =>
        t.title.toLowerCase().includes(s) ||
        (t.description || "").toLowerCase().includes(s) ||
        (t.category || "").toLowerCase().includes(s) ||
        (t.tags || []).some((tag) => tag.toLowerCase().includes(s))
      );
    }
    if (filterStatus === "active") list = list.filter((t) => !t.completed);
    if (filterStatus === "completed") list = list.filter((t) => t.completed);
    if (filterPriority !== "all") list = list.filter((t) => t.priority === filterPriority);
    return [...list].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return 0;
    });
  }, [todos, q, filterStatus, filterPriority]);

  const toggle = async (t) => {
    const next = !t.completed;
    setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, completed: next } : x)));
    try { await api.patch(`/todos/${t.id}`, { completed: next }); refreshTodos(); }
    catch {
      toast.error("Update failed");
      setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, completed: !next } : x)));
    }
  };
  const remove = async (t) => {
    const prev = todos;
    setTodos((p) => p.filter((x) => x.id !== t.id));
    try { await api.delete(`/todos/${t.id}`); toast.success("Deleted"); refreshTodos(); }
    catch { toast.error("Delete failed"); setTodos(prev); }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto" data-testid="tasks-page">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Vault</span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tighter mt-1">Tasks</h1>
        </div>
        <Button onClick={() => openCreate(null)} className="gap-2" data-testid="new-todo-btn">
          <Plus className="h-4 w-4" /> New task
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks, tags, categories..." className="pl-9" data-testid="search-input" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full md:w-[160px]" data-testid="filter-status-trigger"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-full md:w-[160px]" data-testid="filter-priority-trigger"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted-foreground">Loading tasks...</div>
      ) : filtered.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border border-dashed border-border rounded-lg p-16 text-center" data-testid="empty-state">
          <Inbox className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold text-lg">No tasks here</h3>
          <p className="text-sm text-muted-foreground mt-1">Create your first encrypted task to get started.</p>
          <Button onClick={() => openCreate(null)} className="mt-4 gap-2" data-testid="empty-new-btn">
            <Plus className="h-4 w-4" /> New task
          </Button>
        </motion.div>
      ) : (
        <motion.div layout className="space-y-3" data-testid="todo-list">
          <AnimatePresence mode="popLayout">
            {filtered.map((t) => (
              <TodoItem key={t.id} todo={t} onToggle={toggle} onEdit={(todo) => openCreate(todo)} onDelete={remove} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}

export default function Tasks() {
  return (<AppLayout><Inner /></AppLayout>);
}
