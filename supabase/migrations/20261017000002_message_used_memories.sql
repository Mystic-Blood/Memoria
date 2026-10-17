-- Which memories were given to the chat model for each assistant reply, so the UI can show
-- "used these memories" next to the answer (and still show it after a refresh).
ALTER TABLE public.messages ADD COLUMN used_memory_ids UUID[] NOT NULL DEFAULT '{}';
