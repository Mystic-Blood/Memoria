-- Rate limits for /api/chat (per user per minute, per user per day, and an optional global daily cap).
--
-- Why a separate usage table instead of counting public.messages: users can delete their own messages
-- (and whole conversations) through the API, which would reset a limit based on messages, and they can
-- insert message rows directly, which would let one account burn the global cap without ever calling
-- the model. chat_usage is written only by the function below and is not reachable over the API.
--
-- Why one function: counting and recording happen in one transaction under an advisory lock, so a burst
-- of parallel requests cannot all pass the same check (works across any number of serverless instances).

CREATE TABLE public.chat_usage (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- No foreign key on purpose: deleting an account must not hand its usage back to the global cap.
  -- Rows are pruned after two days, so nothing lingers.
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chat_usage_user_recent ON public.chat_usage (user_id, created_at);
CREATE INDEX chat_usage_recent ON public.chat_usage (created_at);

ALTER TABLE public.chat_usage ENABLE ROW LEVEL SECURITY;
-- No policies and no grants: only the SECURITY DEFINER function below touches this table.
REVOKE ALL ON public.chat_usage FROM PUBLIC, anon, authenticated, service_role;

-- Checks the limits for one chat request and, if allowed, records it. Pass NULL for "no limit".
-- Returns {"allowed": bool, "reason": null | "minute" | "day" | "global", "retry_after": seconds}.
-- Windows are rolling (last 60 seconds, last 24 hours); retry_after is when enough old requests leave
-- the window for one more to fit.
CREATE FUNCTION public.chat_usage_take(p_user_id uuid, p_per_minute int, p_per_day int, p_global_per_day int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t timestamptz := now();
  n int;
  edge timestamptz;
BEGIN
  PERFORM public._require_service_role();

  -- Serialise concurrent checks: globally when a global cap is set (it is shared state), else per user.
  IF p_global_per_day IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('memoria.chat_usage.global'));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('memoria.chat_usage.' || p_user_id::text));
  END IF;

  IF p_per_minute IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.chat_usage
    WHERE user_id = p_user_id AND created_at > t - interval '1 minute';
    IF n >= p_per_minute THEN
      SELECT created_at INTO edge FROM public.chat_usage
      WHERE user_id = p_user_id AND created_at > t - interval '1 minute'
      ORDER BY created_at OFFSET greatest(n - p_per_minute, 0) LIMIT 1;
      RETURN jsonb_build_object('allowed', false, 'reason', 'minute',
        'retry_after', greatest(1, ceil(extract(epoch FROM (coalesce(edge, t) + interval '1 minute' - t))))::int);
    END IF;
  END IF;

  IF p_per_day IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.chat_usage
    WHERE user_id = p_user_id AND created_at > t - interval '24 hours';
    IF n >= p_per_day THEN
      SELECT created_at INTO edge FROM public.chat_usage
      WHERE user_id = p_user_id AND created_at > t - interval '24 hours'
      ORDER BY created_at OFFSET greatest(n - p_per_day, 0) LIMIT 1;
      RETURN jsonb_build_object('allowed', false, 'reason', 'day',
        'retry_after', greatest(1, ceil(extract(epoch FROM (coalesce(edge, t) + interval '24 hours' - t))))::int);
    END IF;
  END IF;

  IF p_global_per_day IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.chat_usage WHERE created_at > t - interval '24 hours';
    IF n >= p_global_per_day THEN
      SELECT created_at INTO edge FROM public.chat_usage
      WHERE created_at > t - interval '24 hours'
      ORDER BY created_at OFFSET greatest(n - p_global_per_day, 0) LIMIT 1;
      RETURN jsonb_build_object('allowed', false, 'reason', 'global',
        'retry_after', greatest(1, ceil(extract(epoch FROM (coalesce(edge, t) + interval '24 hours' - t))))::int);
    END IF;
  END IF;

  INSERT INTO public.chat_usage (user_id, created_at) VALUES (p_user_id, t);
  -- Nothing older than the longest window is ever needed (cheap: uses chat_usage_recent).
  DELETE FROM public.chat_usage WHERE created_at < t - interval '2 days';

  RETURN jsonb_build_object('allowed', true, 'reason', null, 'retry_after', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.chat_usage_take(uuid, int, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_usage_take(uuid, int, int, int) TO service_role;
