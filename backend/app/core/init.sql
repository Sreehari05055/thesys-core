-- Local SQLite schema for a single-user OSS chat.
-- Idempotent: CREATE IF NOT EXISTS. Do not DROP on startup.
-- Vectors live in Chroma, not here.

pragma foreign_keys = on;

-- ---------------------------------------------------------------------------
-- LLM catalog (settings lookup)
-- ---------------------------------------------------------------------------
create table if not exists llm_models (
  id          text primary key,
  provider    text not null check (provider <> ''),
  model       text not null unique check (model <> ''),
  is_active   integer not null default 1 check (is_active in (0, 1)),
  is_default  integer not null default 0 check (is_default in (0, 1)),
  created_at  text not null default (datetime('now')),
  updated_at  text not null default (datetime('now'))
);

create unique index if not exists uq_llm_models_default
  on llm_models(is_default)
  where is_default = 1;

insert or ignore into llm_models (id, provider, model, is_active, is_default)
values ('llm-openai-gpt-5.6-luna', 'openai', 'gpt-5.6-luna', 1, 1);

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------
create table if not exists chats (
  id          text primary key,
  title       text not null default 'New Chat',
  is_archived integer not null default 0 check (is_archived in (0, 1)),
  config      text not null default '{"provider":"openai","model":"gpt-5.6-luna"}',
  created_at  text not null default (datetime('now')),
  updated_at  text not null default (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create table if not exists messages (
  id            text primary key,
  chat_id       text not null references chats(id) on delete cascade,
  role          text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content       text not null,
  tool_calls    text,
  tool_call_id  text,
  name          text,
  created_at    text not null default (datetime('now'))
);

create index if not exists idx_messages_chat_id on messages(chat_id);
create index if not exists idx_messages_chat_created on messages(chat_id, created_at);

-- ---------------------------------------------------------------------------
-- RAG citations attached to a message
-- ---------------------------------------------------------------------------
create table if not exists sources (
  id           text primary key,
  message_id   text not null references messages(id) on delete cascade,
  chat_id      text not null references chats(id) on delete cascade,
  chunk_id     text not null,
  doc_id       text not null,
  title        text,
  pages        text,
  bbox         text,
  precise_bbox text,
  score        real,
  content      text,
  created_at   text not null default (datetime('now'))
);

create index if not exists idx_sources_message_id on sources(message_id);
create index if not exists idx_sources_chat_doc on sources(chat_id, doc_id);

-- ---------------------------------------------------------------------------
-- Literature papers attached to a tool message (verified pdf_url lookup)
-- ---------------------------------------------------------------------------
create table if not exists external_papers (
  id               text primary key,
  message_id       text not null references messages(id) on delete cascade,
  chat_id          text not null references chats(id) on delete cascade,
  paper_id         text not null,
  title            text,
  authors          text,
  publication_year integer,
  doi              text,
  abstract         text,
  is_open_access   integer check (is_open_access in (0, 1)),
  pdf_verified     integer not null default 0 check (pdf_verified in (0, 1)),
  pdf_url          text,
  landing_page_url text,
  rerank_score     real,
  created_at       text not null default (datetime('now'))
);

create index if not exists idx_external_papers_chat_paper
  on external_papers(chat_id, paper_id);

-- ---------------------------------------------------------------------------
-- Uploaded / ingested files (bytes live on disk; this is metadata)
-- ---------------------------------------------------------------------------
create table if not exists ingestion_files (
  id            text primary key,
  chat_id       text not null references chats(id) on delete cascade,
  file_name     text not null,
  file_path     text not null,
  file_size     integer,
  mime_type     text,
  source        text not null default 'user_upload'
                  check (source in ('user_upload', 'agent_fetch')),
  status        text not null default 'pending'
                  check (status in ('pending', 'processing', 'processed', 'failed')),
  error_message text,
  metadata      text not null default '{}',
  created_at    text not null default (datetime('now')),
  unique (chat_id, file_name)
);

create index if not exists idx_ingestion_files_chat_id on ingestion_files(chat_id);

-- ---------------------------------------------------------------------------
-- Saved summaries (multiple runs per doc allowed)
-- ---------------------------------------------------------------------------
create table if not exists document_summaries (
  id          text primary key,
  chat_id     text not null references chats(id) on delete cascade,
  doc_id      text not null check (doc_id <> ''),
  filename    text,
  lines       text not null default '[]',
  chunks      text not null default '[]',
  created_at  text not null default (datetime('now')),
  updated_at  text not null default (datetime('now'))
);

create index if not exists idx_document_summaries_chat_doc
  on document_summaries(chat_id, doc_id);
