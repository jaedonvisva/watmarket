-- Migration: Harden resolve_line_invalid_atomic function
-- Issue: Function was missing SET search_path, making it vulnerable to search_path attacks
-- Fix: Add SET search_path TO 'public' to lock the function to the public schema
--
-- Security Context:
-- - SECURITY DEFINER functions run with owner privileges (postgres)
-- - Without fixed search_path, attacker could shadow tables via malicious schema
-- - This is flagged by Supabase's security advisor (lint 0011)

CREATE OR REPLACE FUNCTION public.resolve_line_invalid_atomic(p_line_id uuid, p_resolved_by uuid DEFAULT NULL::uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'  -- SECURITY FIX: Lock search path to prevent schema shadowing
AS $function$
DECLARE
    v_line RECORD;
    v_user_refund RECORD;
    v_total_refunded numeric := 0;
    v_users_refunded integer := 0;
    v_result json;
BEGIN
    -- ========================================================================
    -- STEP 1: Lock and validate the line
    -- ========================================================================
    SELECT * INTO v_line
    FROM lines
    WHERE id = p_line_id
    FOR UPDATE;  -- Row-level lock prevents concurrent resolution
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Line not found: %', p_line_id;
    END IF;
    
    IF v_line.resolved THEN
        RAISE EXCEPTION 'Line already resolved: %', p_line_id;
    END IF;
    
    -- ========================================================================
    -- STEP 2: Mark line as resolved INVALID immediately
    -- This prevents any new trades from occurring
    -- ========================================================================
    UPDATE lines
    SET 
        resolved = true,
        correct_outcome = 'invalid',
        resolved_at = NOW(),
        resolved_by = p_resolved_by
    WHERE id = p_line_id;
    
    -- ========================================================================
    -- STEP 3: Calculate and distribute refunds
    -- 
    -- For each user, calculate:
    --   net_investment = total_buy_stakes - total_sell_revenues
    --   refund = GREATEST(net_investment, 0)  -- Never negative
    --
    -- Data sources:
    --   - Buys: bets table (stake column = money spent)
    --   - Sells: transactions table where type='sell' (amount = money received)
    -- ========================================================================
    
    FOR v_user_refund IN (
        WITH buy_totals AS (
            -- Sum all stakes (money spent) per user for this line
            SELECT 
                user_id,
                COALESCE(SUM(stake), 0) AS total_bought
            FROM bets
            WHERE line_id = p_line_id
            GROUP BY user_id
        ),
        sell_totals AS (
            -- Sum all sell revenues per user for this line
            -- Sells are recorded in transactions with type='sell' and reference_id=line_id
            SELECT 
                user_id,
                COALESCE(SUM(amount), 0) AS total_sold
            FROM transactions
            WHERE reference_id = p_line_id 
              AND type = 'sell'
            GROUP BY user_id
        ),
        user_net AS (
            -- Calculate net investment per user
            SELECT 
                COALESCE(b.user_id, s.user_id) AS user_id,
                COALESCE(b.total_bought, 0) AS total_bought,
                COALESCE(s.total_sold, 0) AS total_sold,
                GREATEST(
                    COALESCE(b.total_bought, 0) - COALESCE(s.total_sold, 0),
                    0
                ) AS refund_amount
            FROM buy_totals b
            FULL OUTER JOIN sell_totals s ON b.user_id = s.user_id
        )
        SELECT * FROM user_net
        WHERE refund_amount > 0  -- Only process users who are owed money
    )
    LOOP
        -- Credit the user's balance
        UPDATE users
        SET karma_balance = karma_balance + v_user_refund.refund_amount::integer
        WHERE id = v_user_refund.user_id;
        
        -- Record refund transaction for audit trail
        INSERT INTO transactions (user_id, amount, type, reference_id, metadata)
        VALUES (
            v_user_refund.user_id,
            v_user_refund.refund_amount::integer,
            'refund',
            p_line_id,
            jsonb_build_object(
                'reason', 'invalid_resolution',
                'total_bought', v_user_refund.total_bought,
                'total_sold', v_user_refund.total_sold
            )
        );
        
        -- Update bet records to show refund (optional: mark payout as refund amount)
        UPDATE bets
        SET payout = NULL  -- Clear any potential payout expectations
        WHERE line_id = p_line_id 
          AND user_id = v_user_refund.user_id;
        
        -- Accumulate totals
        v_total_refunded := v_total_refunded + v_user_refund.refund_amount;
        v_users_refunded := v_users_refunded + 1;
    END LOOP;
    
    -- ========================================================================
    -- STEP 4: Leave liquidity pools unchanged
    --
    -- Some deployments enforce constraints like:
    --   CHECK (yes_pool > 0) and CHECK (no_pool > 0)
    -- so setting pools to 0 would fail.
    --
    -- Trading is still permanently halted because we already set:
    --   lines.resolved = true
    -- ========================================================================

    -- ========================================================================
    -- STEP 5: Return summary
    -- ========================================================================
    SELECT json_build_object(
        'line_id', p_line_id,
        'correct_outcome', 'invalid',
        'users_refunded', v_users_refunded,
        'total_refunded', v_total_refunded,
        'resolved_at', NOW()
    ) INTO v_result;
    
    RETURN v_result;
END;
$function$;

-- Verify the fix
DO $$
DECLARE
    config text;
BEGIN
    SELECT array_to_string(proconfig, ', ')
    INTO config
    FROM pg_proc
    WHERE proname = 'resolve_line_invalid_atomic'
      AND pronamespace = 'public'::regnamespace;
    
    IF config IS NULL OR config NOT LIKE '%search_path%' THEN
        RAISE EXCEPTION 'Migration failed: search_path not set on resolve_line_invalid_atomic';
    END IF;
    
    RAISE NOTICE 'SUCCESS: resolve_line_invalid_atomic now has search_path set: %', config;
END $$;
