-- How long each tool call waited on the platform's side before it was handled (connection
-- queueing under load). The worker reads it: a failed attempt during which the platform's own
-- tool service was slow is retried instead of counting against the team.
alter table public.tool_invocations add column if not exists service_wait_ms int;
