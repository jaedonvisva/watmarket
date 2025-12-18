-- ============================================================================
-- MIGRATION: Drop Legacy Trading RPC Overloads (No Slippage Protection)
-- ============================================================================
-- Goal: enforce that all trade executions provide explicit bounds.
--
-- We keep only:
--   - place_bet_atomic(uuid, uuid, text, integer, double precision)
--   - sell_shares_atomic(uuid, uuid, text, double precision, double precision)
--
-- And drop the legacy overloads that allow bypassing slippage protection.
-- ============================================================================

DROP FUNCTION IF EXISTS public.place_bet_atomic(uuid, uuid, text, integer);
DROP FUNCTION IF EXISTS public.sell_shares_atomic(uuid, uuid, text, double precision);

-- ============================================================================
-- END MIGRATION
-- ============================================================================
