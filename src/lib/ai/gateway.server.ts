/**
 * Thin wrapper around the Lovable AI Gateway (OpenAI-compatible).
 * Returns a parsed JSON object when `json` is true — model is asked to reply
 * in strict JSON via response_format.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export class AIGatewayError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "AIGatewayError";
  }
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function chatJson<T = unknown>(opts: {
  model?: string;
  system?: string;
  user: string;
  temperature?: number;
}): Promise<T> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ist nicht konfiguriert.");

  const messages: ChatMessage[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.user });

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model ?? "google/gemini-3-flash-preview",
      messages,
      temperature: opts.temperature ?? 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) {
      throw new AIGatewayError(429, "KI-Rate-Limit erreicht. Bitte in einem Moment erneut versuchen.");
    }
    if (res.status === 402) {
      throw new AIGatewayError(
        402,
        "Lovable-AI-Credits sind aufgebraucht. Bitte im Workspace unter Settings → Plans & credits aufladen.",
      );
    }
    throw new AIGatewayError(res.status, body.slice(0, 300) || res.statusText);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new AIGatewayError(500, "Leere KI-Antwort.");
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new AIGatewayError(500, `KI-Antwort ist kein gültiges JSON: ${content.slice(0, 200)}`);
  }
}
