import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  currentTask: z.string().max(200).optional(),
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

export const askCoach = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { reply: "The study coach isn't configured yet." };

    const system = [
      "You are the study coach inside 'Locked In', a focus app.",
      "Help the user with the task they are working on right now: explain concepts,",
      "answer study questions clearly, or give practical steps for household chores.",
      "Be concise (under 150 words unless asked for more), concrete and encouraging.",
      "Never tell the user to abandon their session; keep them focused.",
      data.currentTask ? `The user's current task is: "${data.currentTask}".` : "",
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
