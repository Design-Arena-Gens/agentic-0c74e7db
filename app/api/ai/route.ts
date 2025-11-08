export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { message, context } = (await req.json()) as {
      message: string;
      context?: any;
    };

    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey) {
      const sys = buildSystemPrompt(context);
      const payload = {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: message },
        ],
        temperature: 0.4,
      };

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        const t = await r.text();
        throw new Error(`OpenAI error ${r.status}: ${t}`);
      }
      const data = await r.json();
      const reply = data.choices?.[0]?.message?.content?.trim() || "";
      return Response.json({ reply });
    }

    // Fallback deterministic assistant if no API key present
    const reply = localFallback(message, context);
    return Response.json({ reply });
  } catch (err: any) {
    const reply = `I hit an error. Here's a simple plan instead.\n\n${localFallback("Plan my day", {})}`;
    return Response.json({ reply }, { status: 200 });
  }
}

function buildSystemPrompt(context: any) {
  const date = context?.date ?? new Date().toISOString().slice(0, 10);
  const tasks = context?.tasks ?? [];
  const habits = context?.habits ?? [];
  const journal = context?.journal ?? "";
  const tasksText = tasks
    .map((t: any) => `- ${t.time ?? "--:--"} ${t.title}${t.durationMin ? ` (${t.durationMin}m)` : ""}`)
    .join("\n");
  const habitsText = habits.map((h: any) => `${h.name}: ${h.done ? "done" : "todo"}`).join(", ");

  return `You are a daily-routine copilot. Create pragmatic, time-aware plans, focus guidance, and next steps. Prefer concrete schedules with times, short bullets, and clear priorities. Keep tone warm, concise, and actionable.\n\nContext date: ${date}\nTasks:\n${tasksText}\n\nHabits: ${habitsText}\n\nJournal:\n${journal}`;
}

function localFallback(message: string, context: any) {
  const date = context?.date ?? new Date().toISOString().slice(0, 10);
  const tasks = (context?.tasks ?? []) as Array<any>;
  const habits = (context?.habits ?? []) as Array<any>;
  const journal = context?.journal ?? "";

  const pending = tasks.filter((t) => !t.done);
  const planLines: string[] = [`Plan for ${date}`];

  if (pending.length) {
    const morning = pending.filter((t) => ((t.time ?? "12:00").slice(0, 2) as any) < "12");
    const afternoon = pending.filter((t) => ((t.time ?? "13:00").slice(0, 2) as any) >= "12" && ((t.time ?? "13:00").slice(0, 2) as any) < "17");
    const evening = pending.filter((t) => ((t.time ?? "18:00").slice(0, 2) as any) >= "17");

    const fmt = (arr: any[]) =>
      arr
        .sort((a, b) => (a.time ?? "23:59").localeCompare(b.time ?? "23:59"))
        .map((t) => `  ? ${t.time ?? "--:--"}  ${t.title}${t.durationMin ? ` (${t.durationMin}m)` : ""}`)
        .join("\n");

    if (morning.length) planLines.push("Morning:\n" + fmt(morning));
    if (afternoon.length) planLines.push("\nAfternoon:\n" + fmt(afternoon));
    if (evening.length) planLines.push("\nEvening:\n" + fmt(evening));
  } else {
    planLines.push("- No tasks. Add 3 priorities and one easy win.");
  }

  const todoHabits = habits.filter((h) => !h.done);
  if (todoHabits.length) planLines.push(`\nHabits to complete: ${todoHabits.map((h) => h.name).join(", ")}`);
  if (journal?.trim()) planLines.push("\nJournal takeaway: " + journal.split(/\n|\.|!/).filter(Boolean)[0]);

  if (/focus|overwhelm|busy|stress/i.test(message)) {
    planLines.push("\nFocus: Run 2?50m deep work blocks. Silence pings. Batch email twice.");
  }

  planLines.push("\nRemember to schedule breaks and hydrate.");
  return planLines.join("\n");
}
