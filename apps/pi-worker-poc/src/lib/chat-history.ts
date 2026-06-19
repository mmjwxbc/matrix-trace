import type { Env } from "../env.ts";

export type ChatRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessageRow {
  id: string;
  conversation_id: string;
  seq: number;
  role: ChatRole;
  content_json: string;
  content_text: string;
  meta_json: string;
  created_at: number;
}

export interface ChatConversationSummary {
  id: string;
  created_at: number;
  updated_at: number;
  last_message: string;
  message_count: number;
}

export interface PersistTurnInput {
  conversationId: string;
  userMessage: string;
  userMeta?: Record<string, unknown>;
  assistantMessage?: string;
  assistantMeta?: Record<string, unknown>;
}

function ensureConversation(env: Env, conversationId: string, createdAt: number): void {
  if (!env.CHAT_DB) return;
  env.CHAT_DB.prepare(
    `INSERT INTO conversations (id, created_at, updated_at, last_message, message_count)
     VALUES (?1, ?2, ?2, '', 0)
     ON CONFLICT(id) DO NOTHING`
  ).bind(conversationId, createdAt).run();
}

export async function persistTurn(env: Env, input: PersistTurnInput): Promise<void> {
  if (!env.CHAT_DB) return;
  const now = Date.now();

  // Ensure the parent row exists. We can't put this in a transaction with the
  // inserts because we need the row visible to the FK on first insert.
  ensureConversation(env, input.conversationId, now);

  const lastSeqRow = await env.CHAT_DB.prepare(
    `SELECT COALESCE(MAX(seq), 0) AS max_seq
     FROM messages
     WHERE conversation_id = ?1`
  ).bind(input.conversationId).first<{ max_seq: number }>();
  let nextSeq = (lastSeqRow?.max_seq ?? 0) + 1;

  const statements: D1PreparedStatement[] = [];
  const userId = crypto.randomUUID();
  const userSeq = nextSeq++;
  statements.push(
    env.CHAT_DB.prepare(
      `INSERT INTO messages (id, conversation_id, seq, role, content_json, content_text, meta_json, created_at)
       VALUES (?1, ?2, ?3, 'user', ?4, ?5, ?6, ?7)`
    ).bind(
      userId,
      input.conversationId,
      userSeq,
      JSON.stringify({ content: input.userMessage }),
      input.userMessage,
      JSON.stringify(input.userMeta ?? {}),
      now
    )
  );

  let addedCount = 1;
  if (input.assistantMessage) {
    const assistantId = crypto.randomUUID();
    statements.push(
      env.CHAT_DB.prepare(
        `INSERT INTO messages (id, conversation_id, seq, role, content_json, content_text, meta_json, created_at)
         VALUES (?1, ?2, ?3, 'assistant', ?4, ?5, ?6, ?7)`
      ).bind(
        assistantId,
        input.conversationId,
        nextSeq++,
        JSON.stringify({ content: input.assistantMessage }),
        input.assistantMessage,
        JSON.stringify(input.assistantMeta ?? {}),
        now
      )
    );
    addedCount = 2;
  }

  statements.push(
    env.CHAT_DB.prepare(
      `UPDATE conversations
       SET updated_at = ?1,
           last_message = ?2,
           message_count = message_count + ?3
       WHERE id = ?4`
    ).bind(
      now,
      input.assistantMessage ?? input.userMessage,
      addedCount,
      input.conversationId
    )
  );

  await env.CHAT_DB.batch(statements);
}

export async function listMessages(env: Env, conversationId: string): Promise<ChatMessageRow[]> {
  if (!env.CHAT_DB) return [];
  const result = await env.CHAT_DB.prepare(
    `SELECT id, conversation_id, seq, role, content_json, content_text, meta_json, created_at
     FROM messages
     WHERE conversation_id = ?1
     ORDER BY seq ASC`
  ).bind(conversationId).all<ChatMessageRow>();
  return result.results ?? [];
}

export async function listConversations(env: Env, limit = 50): Promise<ChatConversationSummary[]> {
  if (!env.CHAT_DB) return [];
  const result = await env.CHAT_DB.prepare(
    `SELECT id, created_at, updated_at, last_message, message_count
     FROM conversations
     ORDER BY updated_at DESC
     LIMIT ?1`
  ).bind(limit).all<ChatConversationSummary>();
  return result.results ?? [];
}