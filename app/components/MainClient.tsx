"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string; timestamp: number };

type Task = {
  id: string;
  title: string;
  time?: string; // HH:MM
  durationMin?: number;
  done: boolean;
  category?: string;
};

type Habit = { id: string; name: string; done: boolean };

function todayKey() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export default function MainClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Welcome! I can plan your day, track habits, and turn your notes into an actionable schedule. Add tasks on the right or ask me to plan your day.",
      timestamp: Date.now(),
    },
  ]);

  const [input, setInput] = useState("");

  const storageKey = useMemo(() => `daily-bot:${todayKey()}`, []);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([
    { id: "habit_water", name: "Hydration", done: false },
    { id: "habit_move", name: "Exercise", done: false },
    { id: "habit_read", name: "Reading", done: false },
  ]);
  const [journal, setJournal] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const data = JSON.parse(raw);
        setTasks(Array.isArray(data.tasks) ? data.tasks : []);
        setHabits(Array.isArray(data.habits) ? data.habits : []);
        setJournal(typeof data.journal === "string" ? data.journal : "");
      } catch {
        // ignore
      }
    }
  }, [storageKey]);

  useEffect(() => {
    const data = { tasks, habits, journal };
    localStorage.setItem(storageKey, JSON.stringify(data));
  }, [storageKey, tasks, habits, journal]);

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function callAssistant(prompt: string) {
    const context = { tasks, habits, journal, date: todayKey() };
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, context }),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = await res.json();
      return (data.reply as string) || "";
    } catch {
      return simpleLocalPlanner(prompt, context);
    }
  }

  function simpleLocalPlanner(prompt: string, ctx: any) {
    const base: string[] = [];
    const { tasks: ctxTasks, habits: ctxHabits, journal: ctxJournal, date } = ctx;

    const pending = (ctxTasks as Task[]).filter((t) => !t.done);

    base.push(`Plan for ${date}`);
    if (pending.length === 0) {
      base.push("- No tasks yet. Add a few high-impact items.");
    } else {
      const morning: Task[] = [];
      const afternoon: Task[] = [];
      const evening: Task[] = [];
      for (const t of pending) {
        const tm = (t.time ?? "13:00").slice(0, 2);
        const hour = parseInt(tm, 10);
        if (hour < 12) morning.push(t);
        else if (hour < 17) afternoon.push(t);
        else evening.push(t);
      }
      const fmt = (arr: Task[]) =>
        arr
          .sort((a, b) => (a.time ?? "23:59").localeCompare(b.time ?? "23:59"))
          .map((t) => {
            const dur = t.durationMin ? ` (${t.durationMin}m)` : "";
            return `  - ${t.time ?? "--:--"}  ${t.title}${dur}`;
          })
          .join("\n");
      if (morning.length) base.push("Morning:\n" + fmt(morning));
      if (afternoon.length) base.push("\nAfternoon:\n" + fmt(afternoon));
      if (evening.length) base.push("\nEvening:\n" + fmt(evening));
    }

    const undoneHabits = (ctxHabits as Habit[]).filter((h) => !h.done);
    if (undoneHabits.length) {
      base.push("\nHabits to hit: " + undoneHabits.map((h) => h.name).join(", "));
    }
    if (typeof ctxJournal === "string" && ctxJournal.trim()) {
      base.push("\nFrom your notes: " + summarizeJournal(ctxJournal));
    }
    if (/focus|overwhelmed|stress|busy/i.test(prompt)) {
      base.push(
        "\nFocus tip: Block 25-50m deep-work sprints, mute notifications, and batch shallow work."
      );
    }
    return base.join("\n");
  }

  function summarizeJournal(text: string) {
    const sentences = text
      .split(/[.!?]\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return sentences.slice(0, 2).join(". ") + (sentences.length > 2 ? "..." : "");
  }

  async function onSend(custom?: string) {
    const content = (custom ?? input).trim();
    if (!content) return;
    const userMsg: ChatMessage = { role: "user", content, timestamp: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setInput("");

    const reply = await callAssistant(content);
    const aiMsg: ChatMessage = { role: "assistant", content: reply, timestamp: Date.now() };
    setMessages((m) => [...m, aiMsg]);
  }

  function addTask(partial: Partial<Task>) {
    const newTask: Task = {
      id: uid("task"),
      title: partial.title?.trim() || "Untitled",
      time: partial.time,
      durationMin: partial.durationMin,
      done: false,
      category: partial.category,
    };
    setTasks((t) => [...t, newTask]);
  }

  function toggleTask(id: string) {
    setTasks((t) => t.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
  }

  function deleteTask(id: string) {
    setTasks((t) => t.filter((x) => x.id !== id));
  }

  function toggleHabit(id: string) {
    setHabits((h) => h.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
  }

  function planMyDay() {
    onSend("Plan my day with my tasks, habits, and notes.");
  }

  // Task form state
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [dur, setDur] = useState<number | "">("");
  const [cat, setCat] = useState("");

  function submitTask() {
    if (!title.trim()) return;
    addTask({ title, time: time || undefined, durationMin: dur ? Number(dur) : undefined, category: cat || undefined });
    setTitle("");
    setTime("");
    setDur("");
    setCat("");
  }

  return (
    <div className="grid">
      <section className="card" aria-label="Chat">
        <h2>Assistant</h2>
        <div className="content chat">
          <div ref={logRef} className="chat-log">
            {messages.map((m, i) => (
              <div key={i} className={`message ${m.role}`}>
                <div className="role">{m.role === "user" ? "U" : "A"}</div>
                <div className="bubble">
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                  <div className="small" style={{ marginTop: 6 }}>{new Date(m.timestamp).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="stack">
            <div className="toolbar">
              <button className="button" onClick={planMyDay}>Plan my day</button>
              <button className="button ghost" onClick={() => onSend("Summarize my notes and next steps.")}>Summarize notes</button>
              <button className="button ghost" onClick={() => onSend("Create a balanced schedule with breaks.")}>Balance schedule</button>
            </div>
            <div className="row">
              <input className="input" placeholder='Ask anything... e.g., "Help me focus this afternoon"' value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSend()} />
              <button className="button primary" onClick={() => onSend()}>Send</button>
            </div>
          </div>
        </div>
      </section>

      <aside className="stack">
        <section className="card" aria-label="Tasks">
          <h2>Today's Tasks <span className="badge" style={{ marginLeft: 8 }}>{tasks.filter(t=>!t.done).length} pending</span></h2>
          <div className="content stack">
            <div className="row wrap">
              <input className="input" placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              <input className="input" type="number" min={5} step={5} placeholder="mins" value={dur === "" ? "" : String(dur)} onChange={(e) => setDur(e.target.value ? Number(e.target.value) : "")} />
              <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="">Category</option>
                <option>Deep Work</option>
                <option>Meeting</option>
                <option>Errand</option>
                <option>Admin</option>
                <option>Personal</option>
              </select>
              <button className="button" onClick={submitTask}>Add</button>
            </div>
            <div className="list">
              {tasks.length === 0 && <div className="small">No tasks yet. Add something meaningful.</div>}
              {tasks.map((t) => (
                <div key={t.id} className="list-item">
                  <div className="row" style={{ gap: 10 }}>
                    <label className="checkbox">
                      <input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id)} />
                      <span style={{ width: 14, height: 14, borderRadius: 4, background: t.done ? "var(--accent-2)" : "transparent" }} />
                    </label>
                    <div>
                      <div style={{ fontWeight: 600, textDecoration: t.done ? "line-through" : "none" }}>{t.title}</div>
                      <div className="small">{t.time ?? "--:--"} {t.durationMin ? `- ${t.durationMin}m` : ""} {t.category ? `- ${t.category}` : ""}</div>
                    </div>
                  </div>
                  <div className="row">
                    <button className="button ghost" onClick={() => deleteTask(t.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="card" aria-label="Habits">
          <h2>Habits</h2>
          <div className="content list">
            {habits.map((h) => (
              <div key={h.id} className="list-item">
                <div className="row" style={{ gap: 10 }}>
                  <label className="checkbox">
                    <input type="checkbox" checked={h.done} onChange={() => toggleHabit(h.id)} />
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: h.done ? "var(--accent-2)" : "transparent" }} />
                  </label>
                  <div>{h.name}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card" aria-label="Journal">
          <h2>Journal</h2>
          <div className="content stack">
            <textarea rows={6} placeholder="Free-write thoughts, priorities, or blockers..." value={journal} onChange={(e) => setJournal(e.target.value)} />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="small">Autosaved for {todayKey()}</div>
              <button className="button" onClick={() => onSend("Turn my journal into next steps.")}>Next steps</button>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}
