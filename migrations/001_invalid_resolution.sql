-- ============================================================================
-- MIGRATION: Add INVALID resolution support
-- ============================================================================
-- This migration adds support for cancelling/invalidating markets with 
-- atomic refunds based on net investment.
--
-- Accounting Logic:
--   refund = SUM(buy stakes) - SUM(sell revenues)
--   - Each user gets back their net money in the market
--   - Users who sold for profit and withdrew keep that profit (refund = 0)
--   - Trade history is preserved
--   - No negative refunds possible (clamped to 0)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1: Schema Changes
-- ----------------------------------------------------------------------------

-- Extend correct_outcome to allow 'invalid' as a terminal state
-- Note: If using an enum type, you'd do: ALTER TYPE outcome_type ADD VALUE 'invalid';
-- Since we're using text/varchar, we add a check constraint instead.

-- First, drop any existing constraint on correct_outcome if present
DO $$ 
BEGIN
    -- Try to drop constraint if it exists (won't error if it doesn't)
    ALTER TABLE lines DROP CONSTRAINT IF EXISTS check_correct_outcome;
    ALTER TABLE lines DROP CONSTRAINT IF EXISTS lines_correct_outcome_check;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Add constraint allowing yes, no, or invalid
ALTER TABLE lines 
ADD CONSTRAINT check_correct_outcome 
CHECK (correct_outcome IS NULL OR correct_outcome IN ('yes', 'no', 'invalid'));

-- Add resolved_at timestamp for audit trail
ALTER TABLE lines 
ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- Add resolved_by for audit trail (which admin resolved it)
ALTER TABLE lines 
ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id);

-- ----------------------------------------------------------------------------
-- STEP 2: Add 'refund' transaction type
-- ----------------------------------------------------------------------------

-- Extend transaction type constraint to include 'refund'
DO $$ 
BEGIN
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS check_transaction_type;
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

ALTER TABLE transactions 
ADD CONSTRAINT check_transaction_type 
CHECK (type IN ('bet', 'payout', 'initial', 'sell', 'refund'));

-- Add metadata column to transactions if not exists
-- This allows storing additional context for refunds
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS metadata jsonb;

-- ----------------------------------------------------------------------------
-- STEP 3: Atomic INVALID Resolution Function
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION resolve_line_invalid_atomic(
    p_line_id uuid,
    p_resolved_by uuid DEFAULT NULL
) 
RETURNS json 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- ----------------------------------------------------------------------------
-- STEP 4: Add metadata column to transactions if not exists
-- This allows storing additional context for refunds
-- ----------------------------------------------------------------------------

-- (Already added above before the function so the function can insert into it)

-- ----------------------------------------------------------------------------
-- STEP 5: Create index for faster refund calculations
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_transactions_line_refund 
ON transactions(reference_id, type) 
WHERE type IN ('sell', 'refund');

CREATE INDEX IF NOT EXISTS idx_bets_line_user 
ON bets(line_id, user_id);

-- ----------------------------------------------------------------------------
-- STEP 6: Grant execute permission
-- ----------------------------------------------------------------------------

-- Grant to authenticated users (adjust based on your RLS setup)
-- GRANT EXECUTE ON FUNCTION resolve_line_invalid_atomic TO authenticated;

-- ----------------------------------------------------------------------------
-- VERIFICATION QUERIES (run manually to test)
-- ----------------------------------------------------------------------------

/*
-- Test: Check a user's net investment on a line
SELECT 
    b.user_id,
    COALESCE(SUM(b.stake), 0) AS total_bought,
    COALESCE((
        SELECT SUM(t.amount) 
        FROM transactions t 
        WHERE t.user_id = b.user_id 
          AND t.reference_id = b.line_id 
          AND t.type = 'sell'
    ), 0) AS total_sold,
    COALESCE(SUM(b.stake), 0) - COALESCE((
        SELECT SUM(t.amount) 
        FROM transactions t 
        WHERE t.user_id = b.user_id 
          AND t.reference_id = b.line_id 
          AND t.type = 'sell'
    ), 0) AS net_investment
FROM bets b
WHERE b.line_id = 'YOUR-LINE-ID-HERE'
GROUP BY b.user_id, b.line_id;

-- Test: Verify no negative balances after refund
SELECT id, email, karma_balance 
FROM users 
WHERE karma_balance < 0;
*/

-- ============================================================================
-- END MIGRATION
-- ============================================================================
