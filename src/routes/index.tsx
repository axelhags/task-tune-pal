import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, Unlock, Plus, X, Play, SkipForward, Coffee, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LockIn — Focus Lock & Task Switcher" },
      {
        name: "description",
        content:
          "Plan your tasks, lock your phone into focus mode, and get told exactly when to switch task or take a break. The screen unlocks on breaks.",
      },
      { property: "og:title", content: "LockIn — Focus Lock & Task Switcher" },
      {
        property: "og:description",
        content:
          "Lock your phone into a focus session. LockIn tells you when to switch tasks and unlocks when it's break time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Task = { id: string; title: string; minutes: number };
type Phase = "plan" | "focus" | "break" | "done";

const STORAGE_KEY = "lockin.tasks.v1";
const BREAK_MINUTES = 5;

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function Index() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(25);
  const [phase, setPhase] = useState<Phase>("plan");
  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const beeped = useRef(false);

  useEffect(() => {
    setHydrated(true);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setTasks(JSON.parse(raw) as Task[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks, hydrated]);

  const buzz = useCallback((pattern: number[]) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  }, []);

  const startBreak = useCallback(() => {
    setPhase("break");
    setLeft(BREAK_MINUTES * 60);
    buzz([120, 80, 120]);
  }, [buzz]);

  const nextTask = useCallback(() => {
    setIndex((i) => {
      const n = i + 1;
      if (n >= tasks.length) {
        setPhase("done");
        setLeft(0);
      } else {
        setPhase("focus");
        setLeft((tasks[n]?.minutes ?? 25) * 60);
      }
      return n;
    });
    buzz([200]);
  }, [tasks, buzz]);

  useEffect(() => {
    if (phase !== "focus" && phase !== "break") return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (left > 0) {
      beeped.current = false;
      return;
    }
    if (beeped.current) return;
    if (phase === "focus") {
      beeped.current = true;
      startBreak();
    } else if (phase === "break") {
      beeped.current = true;
      nextTask();
    }
  }, [left, phase, startBreak, nextTask]);

  const addTask = () => {
    const t = title.trim();
    if (!t) return;
    setTasks((prev) => [
      ...prev,
      { id: Math.random().toString(36).slice(2), title: t, minutes: Math.max(1, minutes) },
    ]);
    setTitle("");
  };

  const startSession = () => {
    if (!tasks.length) return;
    setIndex(0);
    setPhase("focus");
    setLeft((tasks[0]?.minutes ?? 25) * 60);
    buzz([300]);
  };

  const reset = () => {
    setPhase("plan");
    setIndex(0);
    setLeft(0);
  };

  const current = tasks[index];

  if (phase === "focus" && current) {
    const total = current.minutes * 60;
    const pct = total ? ((total - left) / total) * 100 : 0;
    return (
      <main className="flex min-h-screen flex-col items-center justify-between bg-gradient-focus px-6 py-14 text-center">
        <div className="flex items-center gap-2 rounded-full border border-lock/40 bg-lock/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-lock">
          <Lock className="size-3.5" /> Phone locked
        </div>

        <div className="w-full">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Task {index + 1} of {tasks.length}
          </p>
          <h1 className="mt-3 text-4xl font-bold text-foreground">{current.title}</h1>
          <p className="tabular mt-8 text-7xl font-bold text-primary shadow-glow">{fmt(left)}</p>
          <div className="mx-auto mt-8 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all duration-1000"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Stay on this. Break in {fmt(left)} — then your phone unlocks.
          </p>
        </div>

        <div className="flex w-full max-w-xs flex-col gap-3">
          <button
            onClick={startBreak}
            className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 font-semibold text-primary-foreground transition-transform active:scale-95"
          >
            <Coffee className="size-4" /> Break early (unlock)
          </button>
          <button
            onClick={reset}
            className="text-xs uppercase tracking-[0.2em] text-muted-foreground"
          >
            End session
          </button>
        </div>
      </main>
    );
  }

  if (phase === "break") {
    const next = tasks[index + 1];
    return (
      <main className="flex min-h-screen flex-col items-center justify-between bg-gradient-break px-6 py-14 text-center text-primary-foreground">
        <div className="flex items-center gap-2 rounded-full bg-primary-foreground/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em]">
          <Unlock className="size-3.5" /> Phone unlocked
        </div>
        <div>
          <h1 className="text-4xl font-bold">Break time</h1>
          <p className="tabular mt-6 text-7xl font-bold">{fmt(left)}</p>
          <p className="mt-6 text-sm opacity-80">
            {next ? `Next up: ${next.title} (${next.minutes} min)` : "Last break — then you're done."}
          </p>
        </div>
        <div className="flex w-full max-w-xs flex-col gap-3">
          <button
            onClick={nextTask}
            className="flex items-center justify-center gap-2 rounded-2xl bg-primary-foreground px-5 py-4 font-semibold text-primary transition-transform active:scale-95"
          >
            <SkipForward className="size-4" /> {next ? "Start next task" : "Finish session"}
          </button>
          <button onClick={reset} className="text-xs uppercase tracking-[0.2em] opacity-70">
            End session
          </button>
        </div>
      </main>
    );
  }

  if (phase === "done") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
        <Unlock className="size-10 text-primary" />
        <h1 className="text-4xl font-bold">Session complete</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          You worked through {tasks.length} task{tasks.length === 1 ? "" : "s"}. Your phone stays
          unlocked.
        </p>
        <button
          onClick={reset}
          className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-4 font-semibold text-primary-foreground"
        >
          <RotateCcw className="size-4" /> Plan a new session
        </button>
      </main>
    );
  }

  const totalMin = tasks.reduce((a, t) => a + t.minutes, 0);

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-6 py-12">
      <header>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
          <Lock className="size-3.5" /> LockIn
        </div>
        <h1 className="mt-4 text-4xl font-bold leading-tight">
          Lock your phone.
          <br />
          Work the list.
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Add what you need to do. LockIn holds a full-screen lock while you focus, tells you when to
          switch, and unlocks on every break.
        </p>
      </header>

      <section className="mt-8 rounded-3xl border border-border bg-card p-5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder="What do you need to do?"
          className="w-full rounded-2xl bg-input px-4 py-3 text-base outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
        />
        <div className="mt-3 flex items-center gap-3">
          <div className="flex flex-1 items-center gap-2 rounded-2xl bg-input px-4 py-3">
            <input
              type="number"
              min={1}
              max={180}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="w-14 bg-transparent text-base outline-none"
            />
            <span className="text-sm text-muted-foreground">min</span>
          </div>
          <button
            onClick={addTask}
            className="flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 font-semibold text-primary-foreground transition-transform active:scale-95"
          >
            <Plus className="size-4" /> Add
          </button>
        </div>
      </section>

      <ul className="mt-6 space-y-3">
        {tasks.map((t, i) => (
          <li
            key={t.id}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
          >
            <span className="tabular text-xs text-muted-foreground">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="flex-1 font-medium">{t.title}</span>
            <span className="tabular text-sm text-primary">{t.minutes}m</span>
            <button
              aria-label={`Remove ${t.title}`}
              onClick={() => setTasks((p) => p.filter((x) => x.id !== t.id))}
              className="text-muted-foreground transition-colors hover:text-destructive"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
        {!tasks.length && (
          <li className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No tasks yet — add your first one above.
          </li>
        )}
      </ul>

      {tasks.length > 0 && (
        <div className="sticky bottom-6 mt-8">
          <button
            onClick={startSession}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-5 text-lg font-semibold text-primary-foreground shadow-glow transition-transform active:scale-95"
          >
            <Play className="size-5" /> Lock in · {totalMin} min
          </button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {BREAK_MINUTES}-minute unlocked break after every task.
          </p>
        </div>
      )}
    </main>
  );
}
