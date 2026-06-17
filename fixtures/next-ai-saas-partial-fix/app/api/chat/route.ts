import OpenAI from "openai";
import { auth } from "@/auth";
import { rateLimit } from "@/lib/rate-limit";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  await rateLimit(session.user.id, "chat");
  const body = await request.json();
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: body.message }],
  });

  return Response.json({ text: completion.choices[0]?.message?.content });
}
