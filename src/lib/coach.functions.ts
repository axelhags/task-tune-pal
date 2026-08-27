import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  currentTask: z.string().max(200).optional(),
  nextTask: z.string().max(200).optional(),
  phase: z.enum(["idle", "focus", "break", "done"]).optional(),
  secondsLeft: z.number().int().min(0).max(60 * 60 * 12).optional(),
  taskNumber: z.number().int().min(0).max(500).optional(),
  taskCount: z.number().int().min(0).max(500).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(30),
});

const mmss = (s: number) =>
  `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} sec`;

export const askCoach = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { reply: "The study coach isn't configured yet." };

    const ctx: string[] = [];
    if (data.currentTask) ctx.push(`Current task: "${data.currentTask}".`);
    if (data.taskNumber && data.taskCount)
      ctx.push(`It is task ${data.taskNumber} of ${data.taskCount} in this session.`);
    if (data.phase === "focus")
      ctx.push(
        `The user is LOCKED IN on this task right now, with ${mmss(data.secondsLeft ?? 0)} left before the break.`,
      );
    else if (data.phase === "break")
      ctx.push(
        `The user is on a break with ${mmss(data.secondsLeft ?? 0)} left; the phone is unlocked.`,
      );
    else if (data.phase === "done") ctx.push("The session is finished.");
    else ctx.push("No session is running yet — they are still planning.");
    if (data.nextTask) ctx.push(`Next up afterwards: "${data.nextTask}".`);

    const system = [
      "You are the study coach inside 'Locked In', a focus app.",
      "Help the user with the task they are working on right now: explain concepts,",
      "answer study questions clearly, or give practical steps for household chores.",
      "Be concise (under 150 words unless asked for more), concrete and encouraging.",
      "Never tell the user to abandon their session; keep them focused.",
      "Use the live session context below: tailor answers to the current task, and if little",
      "time is left, scope your advice to what fits in the remaining minutes.",
      "SESSION CONTEXT — " + ctx.join(" "),
    ].join(" ");

    // Gemini rejects a history that ends on an assistant turn.
    const history = [...data.messages];
    while (history.length && history[history.length - 1]?.role !== "user") history.pop();
    if (!history.length) return { reply: "Ask me a question and I'll help." };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [{ role: "system", content: system }, ...history],
      }),
    });

    if (res.status === 429) return { reply: "Too many requests right now — try again in a moment." };
    if (res.status === 402)
      return { reply: "The AI credits for this workspace ran out. Add credits to keep chatting." };
    if (!res.ok) {
      console.error("AI gateway error", res.status, await res.text());
      return { reply: "The coach couldn't answer that. Try again." };
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return { reply: json.choices?.[0]?.message?.content ?? "No answer came back. Try again." };
  });
