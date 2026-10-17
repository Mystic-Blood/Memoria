-- Memoria v2 schema (single baseline; replaces the v1 migration history).
--
-- Design rules
--   * Users can READ their own rows. Every memory WRITE goes through a function below, so the event
--     history cannot be bypassed or forged, and multi-row changes (supersede, confirm) are atomic.
--   * Pipeline functions (called by the server's background memory step with the service role)
--     take an explicit user id; user-action functions take no user id and act as auth.uid().
--   * memory_events is the append-only history of every memory; it also drives the live timeline.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  memory_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (new.id);
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------- conversations, messages
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX conversations_user_recent ON public.conversations (user_id, updated_at DESC);

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation ON public.messages (conversation_id, created_at);
CREATE INDEX messages_user ON public.messages (user_id);

-- -------------------------------------------------------------------------- memories
CREATE TABLE public.memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 1000),
  kind TEXT NOT NULL CHECK (kind IN ('fact', 'preference', 'temporary')),
  -- pending = proposed by the assistant, conflicts with an active memory, waiting for the user
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'superseded', 'expired', 'deleted')),
  expires_at TIMESTAMPTZ,
  conflicts_with UUID REFERENCES public.memories(id) ON DELETE SET NULL,
  superseded_by UUID REFERENCES public.memories(id) ON DELETE SET NULL,
  -- the message that last created or changed this memory (full history lives in memory_events)
  source_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  embedding extensions.vector(768) NOT NULL,
  embedding_profile TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'pending' OR conflicts_with IS NOT NULL),
  CHECK (kind = 'temporary' OR expires_at IS NULL)
);
CREATE INDEX memories_user_status ON public.memories (user_id, status);
CREATE INDEX memories_due ON public.memories (expires_at) WHERE status = 'active' AND expires_at IS NOT NULL;
CREATE INDEX memories_embedding ON public.memories USING hnsw (embedding extensions.vector_cosine_ops);

-- --------------------------------------------------------------------- memory_events
CREATE TABLE public.memory_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN (
    'created', 'updated', 'superseded', 'conflict', 'confirmed', 'rejected', 'edited', 'deleted', 'expired'
  )),
  actor TEXT NOT NULL CHECK (actor IN ('assistant', 'user', 'system')),
  before_content TEXT,
  after_content TEXT,
  related_memory_id UUID REFERENCES public.memories(id) ON DELETE SET NULL,
  reason TEXT,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX memory_events_memory ON public.memory_events (memory_id, created_at);
CREATE INDEX memory_events_user_recent ON public.memory_events (user_id, created_at DESC);
CREATE INDEX memory_events_conversation ON public.memory_events (conversation_id, created_at);

-- ----------------------------------------------------------------------- memory_runs
-- One row per user message processed by the background memory step, so failures are visible.
CREATE TABLE public.memory_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'failed', 'skipped')),
  error TEXT,
  model TEXT,
  operations INT NOT NULL DEFAULT 0,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX memory_runs_conversation ON public.memory_runs (conversation_id, created_at);

-- ------------------------------------------------------------------------------- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_own_read ON public.profiles FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
CREATE POLICY profiles_own_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY conversations_own ON public.conversations FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY messages_own ON public.messages FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- Read-only for users: writes only through the functions below.
CREATE POLICY memories_own_read ON public.memories FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY memory_events_own_read ON public.memory_events FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY memory_runs_own_read ON public.memory_runs FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.profiles, public.conversations, public.messages, public.memories, public.memory_events, public.memory_runs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.memories, public.memory_events, public.memory_runs FROM authenticated;
REVOKE INSERT, DELETE ON public.profiles FROM authenticated;

-- Live timeline: the browser subscribes to its own events and runs (RLS applies to Realtime).
ALTER PUBLICATION supabase_realtime ADD TABLE public.memory_events, public.memory_runs;

-- ========================================================================= functions
-- Internal helpers (not callable over the API).

CREATE FUNCTION public._require_service_role()
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'memory pipeline functions require the service role' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION public._require_user()
RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  RETURN uid;
END;
$$;

CREATE FUNCTION public._conversation_of(p_message_id uuid)
RETURNS uuid LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT conversation_id FROM public.messages WHERE id = p_message_id
$$;

-- ---------------------------------------------------------------- similarity search
-- Active, unexpired memories in the same embedding space, most similar first.
CREATE FUNCTION public.match_memories(
  p_user_id uuid,
  p_embedding extensions.vector(768),
  p_embedding_profile text,
  p_min_similarity float,
  p_limit int
)
RETURNS TABLE (id uuid, content text, kind text, expires_at timestamptz, updated_at timestamptz, similarity float)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT m.id, m.content, m.kind, m.expires_at, m.updated_at,
         1 - (m.embedding OPERATOR(extensions.<=>) p_embedding) AS similarity
  FROM public.memories m
  WHERE m.user_id = p_user_id
    AND m.status = 'active'
    AND m.embedding_profile = p_embedding_profile
    AND (m.expires_at IS NULL OR m.expires_at > now())
    AND 1 - (m.embedding OPERATOR(extensions.<=>) p_embedding) >= p_min_similarity
  ORDER BY m.embedding OPERATOR(extensions.<=>) p_embedding
  LIMIT p_limit
$$;

-- ------------------------------------------------------------- pipeline operations
CREATE FUNCTION public.memory_add(
  p_user_id uuid, p_content text, p_kind text, p_expires_at timestamptz,
  p_embedding extensions.vector(768), p_embedding_profile text, p_message_id uuid, p_reason text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE new_id uuid;
BEGIN
  PERFORM public._require_service_role();
  INSERT INTO public.memories (user_id, content, kind, expires_at, embedding, embedding_profile, source_message_id)
  VALUES (p_user_id, btrim(p_content), p_kind, p_expires_at, p_embedding, p_embedding_profile, p_message_id)
  RETURNING id INTO new_id;
  INSERT INTO public.memory_events (user_id, memory_id, action, actor, after_content, reason, message_id, conversation_id)
  VALUES (p_user_id, new_id, 'created', 'assistant', btrim(p_content), p_reason, p_message_id, public._conversation_of(p_message_id));
  RETURN new_id;
END;
$$;

-- Refine an active memory in place (same id, new wording); the previous wording stays in the history.
CREATE FUNCTION public.memory_update(
  p_user_id uuid, p_memory_id uuid, p_content text, p_kind text, p_expires_at timestamptz,
  p_embedding extensions.vector(768), p_embedding_profile text, p_message_id uuid, p_reason text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_content text;
BEGIN
  PERFORM public._require_service_role();
  SELECT content INTO old_content FROM public.memories
  WHERE id = p_memory_id AND user_id = p_user_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'memory % is not an active memory of this user', p_memory_id;
  END IF;
  UPDATE public.memories
  SET content = btrim(p_content), kind = p_kind, expires_at = p_expires_at, embedding = p_embedding,
      embedding_profile = p_embedding_profile, source_message_id = p_message_id, updated_at = now()
  WHERE id = p_memory_id;
  INSERT INTO public.memory_events (user_id, memory_id, action, actor, before_content, after_content, reason, message_id, conversation_id)
  VALUES (p_user_id, p_memory_id, 'updated', 'assistant', old_content, btrim(p_content), p_reason, p_message_id, public._conversation_of(p_message_id));
END;
$$;

-- Replace an active memory with a new one (the user changed or corrected a fact). Atomic.
CREATE FUNCTION public.memory_supersede(
  p_user_id uuid, p_old_id uuid, p_content text, p_kind text, p_expires_at timestamptz,
  p_embedding extensions.vector(768), p_embedding_profile text, p_message_id uuid, p_reason text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_content text; new_id uuid; conv uuid := public._conversation_of(p_message_id);
BEGIN
  PERFORM public._require_service_role();
  SELECT content INTO old_content FROM public.memories
  WHERE id = p_old_id AND user_id = p_user_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'memory % is not an active memory of this user', p_old_id;
  END IF;
  INSERT INTO public.memories (user_id, content, kind, expires_at, embedding, embedding_profile, source_message_id)
  VALUES (p_user_id, btrim(p_content), p_kind, p_expires_at, p_embedding, p_embedding_profile, p_message_id)
  RETURNING id INTO new_id;
  UPDATE public.memories SET status = 'superseded', superseded_by = new_id, updated_at = now() WHERE id = p_old_id;
  INSERT INTO public.memory_events (user_id, memory_id, action, actor, after_content, related_memory_id, reason, message_id, conversation_id)
  VALUES (p_user_id, new_id, 'created', 'assistant', btrim(p_content), p_old_id, p_reason, p_message_id, conv);
  INSERT INTO public.memory_events (user_id, memory_id, action, actor, before_content, related_memory_id, reason, message_id, conversation_id)
  VALUES (p_user_id, p_old_id, 'superseded', 'assistant', old_content, new_id, p_reason, p_message_id, conv);
  RETURN new_id;
END;
$$;

-- Record a proposed memory that conflicts with an active one; the user decides (confirm / reject).
CREATE FUNCTION public.memory_flag_conflict(
  p_user_id uuid, p_conflicts_with uuid, p_content text, p_kind text, p_expires_at timestamptz,
  p_embedding extensions.vector(768), p_embedding_profile text, p_message_id uuid, p_reason text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE new_id uuid;
BEGIN
  PERFORM public._require_service_role();
  PERFORM 1 FROM public.memories WHERE id = p_conflicts_with AND user_id = p_user_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'memory % is not an active memory of this user', p_conflicts_with;
  END IF;
  INSERT INTO public.memories (user_id, content, kind, status, expires_at, conflicts_with, embedding, embedding_profile, source_message_id)
  VALUES (p_user_id, btrim(p_content), p_kind, 'pending', p_expires_at, p_conflicts_with, p_embedding, p_embedding_profile, p_message_id)
  RETURNING id INTO new_id;
  INSERT INTO public.memory_events (user_id, memory_id, action, actor, after_content, related_memory_id, reason, message_id, conversation_id)
  VALUES (p_user_id, new_id, 'conflict', 'assistant', btrim(p_content), p_conflicts_with, p_reason, p_message_id, public._conversation_of(p_message_id));
  RETURN new_id;
END;
$$;

-- Expire temporary memories whose end date has passed. Returns how many were expired.
CREATE FUNCTION public.memory_expire_due()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n int;
BEGIN
  PERFORM public._require_service_role();
  WITH due AS (
    UPDATE public.memories SET status = 'expired', updated_at = now()
    WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= now()
    RETURNING id, user_id, content
  ), logged AS (
    INSERT INTO public.memory_events (user_id, memory_id, action, actor, before_content, reason)
    SELECT user_id, id, 'expired', 'system', content, 'End date reached' FROM due
    RETURNING 1
  )
  SELECT count(*) INTO n FROM logged;
  RETURN n;
END;
$$;

-- ----------------------------------------------------------------- user actions
-- Accept a pending memory: it becomes active and the memory it conflicted with is superseded.
CREATE FUNCTION public.memory_confirm(p_memory_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := public._require_user(); m record; old_content text;
BEGIN
  SELECT id, content, conflicts_with INTO m FROM public.memories
  WHERE id = p_memory_id AND user_id = uid AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'memory is not pending';
  END IF;
  UPDATE public.memories SET status = 'active', conflicts_with = NULL, updated_at = now() WHERE id = m.id;
  INSERT INTO public.memory_events (user_id, memory_id, action, actor, after_content, related_memory_id, reason)
  VALUES (uid, m.id, 'confirmed', 'user', m.content, m.conflicts_with, 'Confirmed by the user');

  UPDATE public.memories SET status = 'superseded', superseded_by = m.id, updated_at = now()
  WHERE id = m.conflicts_with AND user_id = uid AND status = 'active'
  RETURNING content INTO old_content;
  IF FOUND THEN
    INSERT INTO public.memory_events (user_id, memory_id, action, actor, before_content, related_memory_id, reason)
    VALUES (uid, m.conflicts_with, 'superseded', 'user', old_content, m.id, 'Replaced by a memory the user confirmed');
  END IF;
END;
$$;

CREATE FUNCTION public.memory_reject(p_memory_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := public._require_user(); old_content text;
BEGIN
  UPDATE public.memories SET status = 'deleted', updated_at = now()
  WHERE id = p_memory_id AND user_id = uid AND status = 'pending'
  RETURNING content INTO old_content;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'memory is not pending';
  END IF;
  INSERT INTO public.memory_events (user_id, memory_id, action, actor, before_content, reason)
  VALUES (uid, p_memory_id, 'rejected', 'user', old_content, 'Rejected by the user');
END;
$$;

CREATE FUNCTION public.memory_edit(p_memory_id uuid, p_content text, p_embedding extensions.vector(768), p_embedding_profile text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := public._require_user(); old_content text;
BEGIN
  SELECT content INTO old_content FROM public.memories
  WHERE id = p_memory_id AND user_id = uid AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'only active memories can be edited';
  END IF;
  UPDATE public.memories
  SET content = btrim(p_content), embedding = p_embedding, embedding_profile = p_embedding_profile, updated_at = now()
  WHERE id = p_memory_id;
  INSERT INTO public.memory_events (user_id, memory_id, action, actor, before_content, after_content, reason)
  VALUES (uid, p_memory_id, 'edited', 'user', old_content, btrim(p_content), 'Edited by the user');
END;
$$;

CREATE FUNCTION public.memory_delete(p_memory_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := public._require_user(); old_content text;
BEGIN
  UPDATE public.memories SET status = 'deleted', updated_at = now()
  WHERE id = p_memory_id AND user_id = uid AND status IN ('active', 'pending', 'expired')
  RETURNING content INTO old_content;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'memory not found or already deleted';
  END IF;
  INSERT INTO public.memory_events (user_id, memory_id, action, actor, before_content, reason)
  VALUES (uid, p_memory_id, 'deleted', 'user', old_content, 'Deleted by the user');
END;
$$;

-- ------------------------------------------------------------------ privileges
REVOKE ALL ON FUNCTION
  public._require_service_role(), public._require_user(), public._conversation_of(uuid)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  public.match_memories(uuid, extensions.vector, text, float, int),
  public.memory_add(uuid, text, text, timestamptz, extensions.vector, text, uuid, text),
  public.memory_update(uuid, uuid, text, text, timestamptz, extensions.vector, text, uuid, text),
  public.memory_supersede(uuid, uuid, text, text, timestamptz, extensions.vector, text, uuid, text),
  public.memory_flag_conflict(uuid, uuid, text, text, timestamptz, extensions.vector, text, uuid, text),
  public.memory_expire_due()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.match_memories(uuid, extensions.vector, text, float, int),
  public.memory_add(uuid, text, text, timestamptz, extensions.vector, text, uuid, text),
  public.memory_update(uuid, uuid, text, text, timestamptz, extensions.vector, text, uuid, text),
  public.memory_supersede(uuid, uuid, text, text, timestamptz, extensions.vector, text, uuid, text),
  public.memory_flag_conflict(uuid, uuid, text, text, timestamptz, extensions.vector, text, uuid, text),
  public.memory_expire_due()
TO service_role;

REVOKE ALL ON FUNCTION
  public.memory_confirm(uuid), public.memory_reject(uuid),
  public.memory_edit(uuid, text, extensions.vector, text), public.memory_delete(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.memory_confirm(uuid), public.memory_reject(uuid),
  public.memory_edit(uuid, text, extensions.vector, text), public.memory_delete(uuid)
TO authenticated;
