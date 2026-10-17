-- Permanently erase one archived memory and its whole history.
--
-- "Delete" only archives a memory (status 'deleted'), so the user can see how their memory changed.
-- For privacy that is not enough: a user must be able to make Memoria forget something completely.
-- Erasing is limited to archived memories (deleted, replaced or expired), so it is always a second,
-- deliberate step and never removes something Memoria is still using.
--
-- What goes with the row: every memory_events row of this memory (ON DELETE CASCADE). Those are the
-- only events that hold its text; links from other memories and events (superseded_by, conflicts_with,
-- related_memory_id) are cleared by ON DELETE SET NULL. Chat messages are not touched: what the user
-- wrote stays in their conversation until they delete that.
CREATE FUNCTION public.memory_erase(p_memory_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := public._require_user();
BEGIN
  DELETE FROM public.memories
  WHERE id = p_memory_id AND user_id = uid AND status IN ('deleted', 'superseded', 'expired');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'memory not found or not archived';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.memory_erase(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.memory_erase(uuid) TO authenticated;
