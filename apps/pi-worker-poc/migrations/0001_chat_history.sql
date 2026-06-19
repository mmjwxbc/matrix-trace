-- Chat history archive for matrix-trace.
--
-- Designed for: durable object owns the live Pi session and SSE connection;
-- D1 is the durable, queryable archive across all sessions and users.
--
-- Write path: SessionDO.prompt() commits one (user, assistant) turn at the end
-- of each prompt. Reads happen via GET /api/sessions/:id/messages.
--
-- Schema notes:
-- - `role` mirrors Pi's message roles so we can replay session.state.messages.
-- - `seq` is a per-conversation monotonic counter; lets us ORDER BY cheaply
--   and supports SSE replay without OFFSET.
-- - `meta` is JSON for tool calls / lat / lng / mode without forcing a schema
--   migration every time the DO adds a field.
-- - `content_text` is a denormalized projection of `content` so list views
--   don't have to parse JSON; populated only for text-bearing messages.

CREATE TABLE IF NOT EXISTS conversations (
  id            TEXT PRIMARY KEY,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  last_message  TEXT NOT NULL DEFAULT '',
  message_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
  ON conversations (updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  seq           INTEGER NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content_json  TEXT NOT NULL,
  content_text  TEXT NOT NULL DEFAULT '',
  meta_json     TEXT NOT NULL DEFAULT '{}',
  created_at    INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_seq
  ON messages (conversation_id, seq);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages (conversation_id, created_at);