import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Lock,
  Unlock,
  Plus,
  X,
  Play,
  SkipForward,
  Coffee,
  RotateCcw,
  ListChecks,
  Sparkles,
  Send,
  Loader2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { askCoach } from "@/lib/coach.functions";
import {
  detectScreenTime,
  requestScreenTime,
  startShielding,
  stopShielding,
  type ShieldStatus,
} from "@/lib/screen-time";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Locked In — Focus Lock, Schedule & Study Coach" },
      {
        name: "description",
        content:
          "Plan your study or chore list, lock your phone into focus mode with a switch-task countdown, and ask the built-in AI coach whenever you get stuck.",
      },
      { property: "og:title", content: "Locked In — Focus Lock, Schedule & Study Coach" },
      {
        property: "og:description",
        content:
          "Plan, lock in, and get AI help. Locked In runs your schedule, tells you when to switch tasks, and unlocks on breaks.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Task = { id: string; title: string; minutes: number };
type Phase = "idle" | "focus" | "break" | "done";
type Tab = "plan" | "lock" | "coach";
type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "lockedin.tasks.v1";
const BREAK_MINUTES = 5;

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function Index() {
  const [tab, setTab] = useState<Tab>("plan");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(25);
  const [phase, setPhase] = useState<Phase>("idle");
  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const fired = useRef(false);
  const [shield, setShield] = useState<ShieldStatus>("unsupported");

  useEffect(() => {
    void detectScreenTime().then(setShield);
  }, []);

  const enableShield = async () => setShield(await requestScreenTime());


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
      fired.current = false;
      return;
    }
    if (fired.current) return;
    if (phase === "focus") {
      fired.current = true;
      startBreak();
    } else if (phase === "break") {
      fired.current = true;
      nextTask();
    }
  }, [left, phase, startBreak, nextTask]);

  // Keep the screen awake while locked into a task (supported browsers).
  useEffect(() => {
    if (phase !== "focus") return;
    let sentinel: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    nav.wakeLock
      ?.request("screen")
      .then((s) => {
        if (cancelled) void s.release();
        else sentinel = s;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      void sentinel?.release().catch(() => undefined);
    };
  }, [phase]);

  // Block other apps through iOS Screen Time while focusing (native shell only).
  const task = tasks[index];
  useEffect(() => {
    if (shield === "unsupported" || shield === "unauthorized") return;
    if (phase === "focus" && task) {
      void startShielding(task.title, task.minutes * 60).then((ok) => {
        if (ok) setShield("shielding");
      });
    } else {
      void stopShielding().then(() => setShield((s) => (s === "shielding" ? "ready" : s)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index, task?.id]);

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
    setPhase("idle");
    setIndex(0);
    setLeft(0);
  };

  const current = tasks[index];
  const totalMin = tasks.reduce((a, t) => a + t.minutes, 0);

  // Full-screen lock overlay takes over the whole app while focusing.
  if (phase === "focus" && current) {
    const total = current.minutes * 60;
    const pct = total ? ((total - left) / total) * 100 : 0;
    return (
      <main className="flex min-h-screen flex-col items-center justify-between bg-gradient-focus px-6 py-14 text-center">
        <div className="flex items-center gap-2 rounded-full border border-lock/40 bg-lock/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-lock">
          <Lock className="size-3.5" />
          {shield === "shielding" ? "Apps blocked" : "Phone locked"}
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
            {tasks[index + 1]
              ? `Break in ${fmt(left)}, then switch to “${tasks[index + 1]?.title}”.`
              : `Break in ${fmt(left)} — last task of the session.`}
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

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
      <div className="flex-1 px-6 pb-32 pt-10">
        {tab === "plan" && (
          <PlanTab
            tasks={tasks}
            setTasks={setTasks}
            title={title}
            setTitle={setTitle}
            minutes={minutes}
            setMinutes={setMinutes}
            addTask={addTask}
            onReady={() => setTab("lock")}
          />
        )}
        {tab === "lock" && (
          <LockTab
            tasks={tasks}
            phase={phase}
            index={index}
            left={left}
            totalMin={totalMin}
            startSession={startSession}
            nextTask={nextTask}
            reset={reset}
            goPlan={() => setTab("plan")}
            shield={shield}
            enableShield={() => void enableShield()}
          />
        )}
        {tab === "coach" && (
          <CoachTab
            currentTask={current?.title}
            nextTask={tasks[index + 1]?.title}
            phase={phase}
            secondsLeft={left}
            taskNumber={tasks.length ? index + 1 : 0}
            taskCount={tasks.length}
          />
        )}
      </div>

      <nav className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-border bg-card/95 backdrop-blur">
        <div className="grid grid-cols-3">
          {(
            [
              ["plan", "Plan", ListChecks],
              ["lock", "Lock in", Lock],
              ["coach", "Coach", Sparkles],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex flex-col items-center gap-1 py-4 text-[11px] font-semibold uppercase tracking-[0.15em] transition-colors ${
                tab === key ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="size-5" />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function PlanTab({
  tasks,
  setTasks,
  title,
  setTitle,
  minutes,
  setMinutes,
  addTask,
  onReady,
}: {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  title: string;
  setTitle: (v: string) => void;
  minutes: number;
  setMinutes: (v: number) => void;
  addTask: () => void;
  onReady: () => void;
}) {
  return (
    <>
      <header>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
          <ListChecks className="size-3.5" /> Plan
        </div>
        <h1 className="mt-4 text-4xl font-bold leading-tight">What do you need to get done?</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Add each study block or chore with how long it should take. Locked In turns it into a
          schedule with a {BREAK_MINUTES}-minute unlocked break after every task.
        </p>
      </header>

      <section className="mt-8 rounded-3xl border border-border bg-card p-5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder="e.g. Revise chapter 4 / Load the dishwasher"
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
        <button
          onClick={onReady}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-6 py-4 font-semibold text-primary"
        >
          <Lock className="size-4" /> Go to Lock in
        </button>
      )}
    </>
  );
}

function LockTab({
  tasks,
  phase,
  index,
  left,
  totalMin,
  startSession,
  nextTask,
  reset,
  goPlan,
}: {
  tasks: Task[];
  phase: Phase;
  index: number;
  left: number;
  totalMin: number;
  startSession: () => void;
  nextTask: () => void;
  reset: () => void;
  goPlan: () => void;
}) {
  const next = tasks[index + 1];
  return (
    <>
      <header>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
          <Lock className="size-3.5" /> Locked In
        </div>
        <h1 className="mt-4 text-4xl font-bold leading-tight">Your schedule</h1>
      </header>

      {phase === "break" && (
        <section className="mt-6 rounded-3xl bg-gradient-break p-6 text-center text-primary-foreground">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em]">
            <Unlock className="size-3.5" /> Phone unlocked
          </div>
          <p className="tabular mt-5 text-6xl font-bold">{fmt(left)}</p>
          <p className="mt-3 text-sm opacity-80">
            {next ? `Next up: ${next.title} (${next.minutes} min)` : "Last break — then you're done."}
          </p>
          <button
            onClick={nextTask}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-foreground px-5 py-4 font-semibold text-primary active:scale-95"
          >
            <SkipForward className="size-4" /> {next ? "Start next task" : "Finish session"}
          </button>
        </section>
      )}

      {phase === "done" && (
        <section className="mt-6 rounded-3xl border border-border bg-card p-6 text-center">
          <Unlock className="mx-auto size-8 text-primary" />
          <h2 className="mt-3 text-2xl font-bold">Session complete</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You worked through {tasks.length} task{tasks.length === 1 ? "" : "s"}. Phone stays
            unlocked.
          </p>
          <button
            onClick={reset}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 font-semibold text-primary-foreground"
          >
            <RotateCcw className="size-4" /> Plan a new session
          </button>
        </section>
      )}

      <ol className="mt-6 space-y-3">
        {tasks.map((t, i) => {
          const active = phase !== "idle" && phase !== "done" && i === index;
          const done = phase === "done" || i < index;
          return (
            <li
              key={t.id}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-4 ${
                active
                  ? "border-primary bg-primary/10"
                  : done
                    ? "border-border bg-card opacity-50"
                    : "border-border bg-card"
              }`}
            >
              <span className="tabular text-xs text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className={`flex-1 font-medium ${done ? "line-through" : ""}`}>{t.title}</span>
              <span className="tabular text-sm text-primary">
                {active && phase === "focus" ? fmt(left) : `${t.minutes}m`}
              </span>
            </li>
          );
        })}
        {!tasks.length && (
          <li className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing scheduled yet.{" "}
            <button onClick={goPlan} className="font-semibold text-primary underline">
              Add tasks in Plan
            </button>
            .
          </li>
        )}
      </ol>

      {tasks.length > 0 && (phase === "idle" || phase === "done") && (
        <div className="mt-8">
          <button
            onClick={startSession}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-5 text-lg font-semibold text-primary-foreground shadow-glow transition-transform active:scale-95"
          >
            <Play className="size-5" /> Turn on locked mode · {totalMin} min
          </button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            The screen locks onto one task at a time and unlocks for every {BREAK_MINUTES}-minute
            break.
          </p>
        </div>
      )}
    </>
  );
}

function CoachTab({ currentTask }: { currentTask?: string | undefined }) {
  const ask = useServerFn(askCoach);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await ask({ data: { currentTask, messages: next.slice(-20) } });
      setMessages([...next, { role: "assistant", content: res.reply }]);
    } catch {
      setMessages([
        ...next,
        { role: "assistant", content: "Something went wrong reaching the coach. Try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <header>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
          <Sparkles className="size-3.5" /> Coach
        </div>
        <h1 className="mt-4 text-4xl font-bold leading-tight">Stuck? Ask.</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {currentTask
            ? `Answering questions about “${currentTask}” — or anything else you're working on.`
            : "Ask about your studies or how to tackle a chore."}
        </p>
      </header>

      <div className="mt-6 space-y-3">
        {!messages.length && (
          <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Try: “Explain photosynthesis simply” or “Fastest way to clean a greasy oven?”
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "border border-border bg-card"
            }`}
          >
            {m.role === "assistant" ? (
              <div className="space-y-2 [&_a]:underline [&_li]:ml-4 [&_li]:list-disc [&_strong]:font-semibold">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            ) : (
              m.content
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="fixed inset-x-0 bottom-[76px] mx-auto w-full max-w-md bg-background/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void send()}
            placeholder="Ask a question…"
            className="flex-1 rounded-2xl bg-input px-4 py-3 text-base outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={() => void send()}
            disabled={loading}
            aria-label="Send"
            className="rounded-2xl bg-primary p-3 text-primary-foreground disabled:opacity-50"
          >
            <Send className="size-5" />
          </button>
        </div>
      </div>
    </>
  );
}
