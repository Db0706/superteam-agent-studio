-- Conversation history for the rehearsal fixture apps when served from serverless hosting, where
-- an in-process store doesn't survive between requests. Only the server's own connection uses it.
create table public.fixture_memory (
  key text primary key,
  history jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
alter table public.fixture_memory enable row level security;
revoke all on public.fixture_memory from anon, authenticated;
