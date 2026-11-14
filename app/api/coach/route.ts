/**
 * AI コーチ API。ローカルの LLM（llama-server / OpenAI 互換）に中継する。
 *
 * - 接続先はサーバの環境変数だけで決める（クライアントから URL を受け取らない = SSRF 対策）
 * - クライアントからは「解説の種類」と「事実シート」だけを受け取り、プロンプトはサーバで組み立てる
 * - 応答はテキストのストリームで返す
 */
import { COACH_KINDS, MAX_FACT_LINE_LENGTH, MAX_FACT_LINES, buildMessages } from "@/lib/mahjong/coach/prompt";
import type { CoachKind } from "@/lib/mahjong/coach/facts";

const BASE_URL = (process.env.LLM_BASE_URL ?? "http://127.0.0.1:8080/v1").replace(/\/$/, "");
const MODEL = process.env.LLM_MODEL ?? "local";
const MAX_TOKENS = 700;

export async function GET() {
  try {
    const res = await fetch(`${BASE_URL}/models`, { signal: AbortSignal.timeout(2000), cache: "no-store" });
    if (!res.ok) return Response.json({ ok: false, error: `LLM サーバが ${res.status} を返しました` });
    const data = (await res.json()) as { data?: { id: string }[] };
    const id = data.data?.[0]?.id ?? MODEL;
    return Response.json({ ok: true, model: id.split("/").pop() });
  } catch {
    return Response.json({ ok: false, error: "LLM サーバに接続できません" });
  }
}

function parseBody(body: unknown): { kind: CoachKind; lines: string[] } | null {
  if (!body || typeof body !== "object") return null;
  const { kind, lines } = body as { kind?: unknown; lines?: unknown };
  if (typeof kind !== "string" || !COACH_KINDS.includes(kind as CoachKind)) return null;
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > MAX_FACT_LINES) return null;
  if (!lines.every((l) => typeof l === "string" && l.length <= MAX_FACT_LINE_LENGTH)) return null;
  return { kind: kind as CoachKind, lines: lines as string[] };
}

export async function POST(request: Request) {
  let parsed: ReturnType<typeof parseBody>;
  try {
    parsed = parseBody(await request.json());
  } catch {
    parsed = null;
  }
  if (!parsed) return Response.json({ error: "リクエストの形式が正しくありません" }, { status: 400 });

  let upstream: Response;
  try {
    upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: request.signal,
      body: JSON.stringify({
        model: MODEL,
        messages: buildMessages(parsed.kind, parsed.lines),
        temperature: 0.3,
        max_tokens: MAX_TOKENS,
        stream: true,
        // gemma4 などの思考モードを止めて、本文をすぐ返させる
        chat_template_kwargs: { enable_thinking: false },
      }),
    });
  } catch {
    return Response.json({ error: "LLM サーバに接続できません" }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: `LLM サーバがエラーを返しました（${upstream.status}）` }, { status: 502 });
  }

  // SSE（data: {...}）から本文の差分だけを取り出してテキストで流す
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  // 行の途中で切れたチャンクは次回に持ち越す
  let buffer = "";
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n");
        buffer = events.pop() ?? "";
        let emitted = false;
        for (const line of events) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") {
            controller.close();
            return;
          }
          try {
            const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
            const text = json.choices?.[0]?.delta?.content;
            if (text) {
              controller.enqueue(encoder.encode(text));
              emitted = true;
            }
          } catch {
            // 不完全な行は無視
          }
        }
        if (emitted) return;
      }
    },
    cancel() {
      void reader.cancel();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
