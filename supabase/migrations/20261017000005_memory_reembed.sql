-- Re-embed a memory after switching embedding models (npm run reindex).
--
-- Each stored vector records the model that made it (embedding_profile), and retrieval only compares
-- vectors of the same profile. Switching models (local Ollama <-> Gemini) therefore made every existing
-- memory invisible until it was re-embedded. Only the vector and its profile change: content, status and
-- history stay as they are, so this is not a memory event. Server only (service_role).
CREATE FUNCTION public.memory_reembed(p_memory_id uuid, p_embedding extensions.vector(768), p_embedding_profile text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public._require_service_role();
  UPDATE public.memories SET embedding = p_embedding, embedding_profile = p_embedding_profile
  WHERE id = p_memory_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'memory not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.memory_reembed(uuid, extensions.vector, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.memory_reembed(uuid, extensions.vector, text) TO service_role;
