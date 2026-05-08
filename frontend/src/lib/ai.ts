const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export type AIMode = "continue" | "improve" | "shorten" | "expand";

export async function aiSuggest(
  context: string,
  mode: AIMode = "continue",
  sessionId?: string
): Promise<{ suggestion: string; session_id: string }> {
  const res = await fetch(`${BASE}/api/ai/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context, mode, session_id: sessionId }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI request failed: ${res.status} ${err}`);
  }
  return res.json();
}
