-- ============================================================================
-- MIGRATION: Security Hardening (RPC privileges + admin immutability)
-- ============================================================================
-- Purpose:
-- - Prevent unauthenticated/direct Supabase REST RPC calls to SECURITY DEFINER
--   functions by revoking EXECUTE from anon/authenticated/public.
-- - Prevent users from self-escalating privileges by updating users.is_admin.
--
-- NOTE:
-- - This repo does not include the full base schema/policies.
-- - Apply this migration in Supabase after verifying the function signatures
--   match your deployed DB.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Revoke public EXECUTE on SECURITY DEFINER RPCs
-- ----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.place_bet_atomic(uuid, uuid, text, integer, double precision) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.sell_shares_atomic(uuid, uuid, text, double precision, double precision) FROM anon, authenticated, public;

-- Resolution RPCs are launch-blocking if callable by public roles.
-- Signatures may vary across deployments; adjust if yours differ.
REVOKE EXECUTE ON FUNCTION public.resolve_line_atomic(uuid, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.resolve_line_invalid_atomic(uuid, uuid) FROM anon, authenticated, public;

-- If you want the FastAPI backend (service role key) to keep calling these RPCs:
GRANT EXECUTE ON FUNCTION public.place_bet_atomic(uuid, uuid, text, integer, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.sell_shares_atomic(uuid, uuid, text, double precision, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_line_atomic(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_line_invalid_atomic(uuid, uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 2) Block users from self-updating is_admin
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_users_is_admin_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    -- Only allow backend/service role to change admin flag.
    -- In Supabase, auth.role() is derived from request JWT claims and may be NULL
    -- in SQL editor / migrations. We still allow trusted DB roles there.
    IF COALESCE(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'is_admin is immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_users_is_admin_update ON public.users;

CREATE TRIGGER trg_prevent_users_is_admin_update
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_users_is_admin_update();

-- ============================================================================
-- END MIGRATION
-- ============================================================================
