-- ============================================================================
-- MIGRATION: Skill Score Leaderboard
-- ============================================================================
-- Implements a Risk-Adjusted Return (Skill Score) leaderboard using log returns.
--
-- Scoring Formula:
--   Score = SUM(log(1 + profit_i / capital_at_risk_i)) for all resolved markets
--
-- Security Features:
--   - Only includes validly resolved markets (yes/no outcomes, excludes invalid)
--   - Enforces minimum participation threshold
--   - Prevents manipulation via zero-risk exposure guards
--   - Returns only aggregate data (no private balances/positions exposed)
--   - SECURITY DEFINER with explicit search_path to prevent injection
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1: Create the leaderboard computation function
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_leaderboard(
    p_limit integer DEFAULT 100,
    p_min_markets integer DEFAULT 3
)
RETURNS TABLE (
    rank bigint,
    user_id uuid,
    display_name text,
    skill_score numeric,
    total_profit numeric,
    markets_participated integer,
    win_rate numeric,
    avg_return_per_market numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
    RETURN QUERY
    WITH 
    -- Get all resolved markets (exclude invalid/voided)
    resolved_markets AS (
        SELECT id, correct_outcome
        FROM lines
        WHERE resolved = true
          AND correct_outcome IN ('yes', 'no')
    ),
    
    -- Calculate per-user, per-market metrics
    user_market_performance AS (
        SELECT 
            b.user_id,
            b.line_id,
            rm.correct_outcome,
            -- Capital at risk = total amount staked in this market
            SUM(b.stake) AS capital_at_risk,
            -- Total shares acquired
            SUM(b.shares) AS total_shares,
            -- Outcome the user bet on (aggregate - take the predominant one)
            MODE() WITHIN GROUP (ORDER BY b.outcome) AS primary_outcome,
            -- Revenue from sells (if any) for this market
            COALESCE((
                SELECT SUM(t.amount)
                FROM transactions t
                WHERE t.user_id = b.user_id
                  AND t.reference_id = b.line_id
                  AND t.type = 'sell'
            ), 0) AS sell_revenue
        FROM bets b
        INNER JOIN resolved_markets rm ON b.line_id = rm.id
        GROUP BY b.user_id, b.line_id, rm.correct_outcome
        -- Exclude zero or near-zero capital exposure to prevent manipulation
        HAVING SUM(b.stake) >= 1
    ),
    
    -- Calculate profit/loss per market
    user_market_pnl AS (
        SELECT 
            ump.user_id,
            ump.line_id,
            ump.capital_at_risk,
            ump.total_shares,
            ump.primary_outcome,
            ump.correct_outcome,
            ump.sell_revenue,
            -- Profit calculation:
            -- If user's primary outcome matches correct_outcome: they won
            -- Profit = shares (payout) + sell_revenue - capital_at_risk
            -- If not: they lost
            -- Profit = sell_revenue - capital_at_risk (sell_revenue could be partial exit)
            CASE 
                WHEN ump.primary_outcome = ump.correct_outcome THEN
                    -- Winner: payout = shares (1 share = 1 GOOS on win)
                    ump.total_shares + ump.sell_revenue - ump.capital_at_risk
                ELSE
                    -- Loser: only sell revenue counts
                    ump.sell_revenue - ump.capital_at_risk
            END AS profit,
            CASE WHEN ump.primary_outcome = ump.correct_outcome THEN 1 ELSE 0 END AS is_win
        FROM user_market_performance ump
    ),
    
    -- Calculate log returns per market (skill score component)
    user_market_log_returns AS (
        SELECT 
            ump.user_id,
            ump.line_id,
            ump.capital_at_risk,
            ump.profit,
            ump.is_win,
            -- Log return: log(1 + profit/capital_at_risk)
            -- Clamp ratio to prevent log(0) or log(negative)
            -- Minimum ratio is -0.99 (99% loss), so 1 + ratio >= 0.01
            LN(GREATEST(1.0 + (ump.profit::numeric / NULLIF(ump.capital_at_risk, 0)::numeric), 0.01))::numeric AS log_return
        FROM user_market_pnl ump
        WHERE ump.capital_at_risk > 0
    ),
    
    -- Aggregate per user
    user_aggregates AS (
        SELECT 
            umlr.user_id,
            -- Skill Score = sum of log returns
            SUM(umlr.log_return)::numeric AS skill_score,
            -- Total profit across all markets
            SUM(umlr.profit)::numeric AS total_profit,
            -- Number of markets participated
            COUNT(DISTINCT umlr.line_id)::integer AS markets_participated,
            -- Win rate
            CASE 
                WHEN COUNT(*) > 0 THEN 
                    (SUM(umlr.is_win)::numeric / COUNT(*)::numeric) * 100
                ELSE 0 
            END AS win_rate,
            -- Average return per market
            (AVG(umlr.profit::numeric / NULLIF(umlr.capital_at_risk, 0)::numeric) * 100)::numeric AS avg_return_per_market
        FROM user_market_log_returns umlr
        GROUP BY umlr.user_id
        -- Minimum participation threshold
        HAVING COUNT(DISTINCT umlr.line_id) >= p_min_markets
    ),
    
    -- Join with users table to get display info (anonymized)
    ranked_users AS (
        SELECT 
            ROW_NUMBER() OVER (ORDER BY ua.skill_score DESC, ua.total_profit DESC) AS rank,
            ua.user_id,
            -- Anonymize email: show first 2 chars + *** + domain
            CASE 
                WHEN LENGTH(SPLIT_PART(u.email, '@', 1)) > 2 THEN
                    LEFT(SPLIT_PART(u.email, '@', 1), 2) || '***@' || SPLIT_PART(u.email, '@', 2)
                ELSE
                    '***@' || SPLIT_PART(u.email, '@', 2)
            END AS display_name,
            ROUND(ua.skill_score::numeric, 4) AS skill_score,
            ROUND(ua.total_profit::numeric, 2) AS total_profit,
            ua.markets_participated,
            ROUND(ua.win_rate::numeric, 1) AS win_rate,
            ROUND(ua.avg_return_per_market::numeric, 1) AS avg_return_per_market
        FROM user_aggregates ua
        INNER JOIN users u ON ua.user_id = u.id
    )
    
    SELECT 
        ru.rank,
        ru.user_id,
        ru.display_name,
        ru.skill_score,
        ru.total_profit,
        ru.markets_participated,
        ru.win_rate,
        ru.avg_return_per_market
    FROM ranked_users ru
    ORDER BY ru.rank ASC
    LIMIT p_limit;
END;
$$;

-- ----------------------------------------------------------------------------
-- STEP 2: Create a function to get a specific user's leaderboard stats
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_user_leaderboard_stats(
    p_user_id uuid,
    p_min_markets integer DEFAULT 3
)
RETURNS TABLE (
    rank bigint,
    skill_score numeric,
    total_profit numeric,
    markets_participated integer,
    win_rate numeric,
    avg_return_per_market numeric,
    qualifies boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_user_stats RECORD;
    v_rank bigint;
BEGIN
    -- Calculate user's stats
    WITH 
    resolved_markets AS (
        SELECT id, correct_outcome
        FROM lines
        WHERE resolved = true
          AND correct_outcome IN ('yes', 'no')
    ),
    user_market_performance AS (
        SELECT 
            b.user_id,
            b.line_id,
            rm.correct_outcome,
            SUM(b.stake) AS capital_at_risk,
            SUM(b.shares) AS total_shares,
            MODE() WITHIN GROUP (ORDER BY b.outcome) AS primary_outcome,
            COALESCE((
                SELECT SUM(t.amount)
                FROM transactions t
                WHERE t.user_id = b.user_id
                  AND t.reference_id = b.line_id
                  AND t.type = 'sell'
            ), 0) AS sell_revenue
        FROM bets b
        INNER JOIN resolved_markets rm ON b.line_id = rm.id
        WHERE b.user_id = p_user_id
        GROUP BY b.user_id, b.line_id, rm.correct_outcome
        HAVING SUM(b.stake) >= 1
    ),
    user_market_pnl AS (
        SELECT 
            ump.user_id,
            ump.line_id,
            ump.capital_at_risk,
            CASE 
                WHEN ump.primary_outcome = ump.correct_outcome THEN
                    ump.total_shares + ump.sell_revenue - ump.capital_at_risk
                ELSE
                    ump.sell_revenue - ump.capital_at_risk
            END AS profit,
            CASE WHEN ump.primary_outcome = ump.correct_outcome THEN 1 ELSE 0 END AS is_win
        FROM user_market_performance ump
    ),
    user_market_log_returns AS (
        SELECT 
            ump.user_id,
            ump.line_id,
            ump.capital_at_risk,
            ump.profit,
            ump.is_win,
            LN(GREATEST(1.0 + (ump.profit::numeric / NULLIF(ump.capital_at_risk, 0)::numeric), 0.01))::numeric AS log_return
        FROM user_market_pnl ump
        WHERE ump.capital_at_risk > 0
    )
    SELECT 
        SUM(log_return)::numeric AS skill_score,
        SUM(profit)::numeric AS total_profit,
        COUNT(DISTINCT line_id)::integer AS markets_participated,
        CASE 
            WHEN COUNT(*) > 0 THEN 
                (SUM(is_win)::numeric / COUNT(*)::numeric) * 100
            ELSE 0 
        END AS win_rate,
        (AVG(profit::numeric / NULLIF(capital_at_risk, 0)::numeric) * 100)::numeric AS avg_return_per_market
    INTO v_user_stats
    FROM user_market_log_returns;
    
    -- Get user's rank if they qualify
    IF v_user_stats.markets_participated >= p_min_markets THEN
        SELECT COUNT(*) + 1 INTO v_rank
        FROM get_leaderboard(1000, p_min_markets) lb
        WHERE lb.skill_score > COALESCE(v_user_stats.skill_score, 0);
    ELSE
        v_rank := NULL;
    END IF;
    
    RETURN QUERY SELECT 
        v_rank,
        ROUND(COALESCE(v_user_stats.skill_score, 0)::numeric, 4),
        ROUND(COALESCE(v_user_stats.total_profit, 0)::numeric, 2),
        COALESCE(v_user_stats.markets_participated, 0),
        ROUND(COALESCE(v_user_stats.win_rate, 0)::numeric, 1),
        ROUND(COALESCE(v_user_stats.avg_return_per_market, 0)::numeric, 1),
        COALESCE(v_user_stats.markets_participated, 0) >= p_min_markets;
END;
$$;

-- ----------------------------------------------------------------------------
-- STEP 3: Create indexes to optimize leaderboard queries
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_bets_user_line_resolved
ON bets(user_id, line_id);

CREATE INDEX IF NOT EXISTS idx_lines_resolved_outcome
ON lines(resolved, correct_outcome)
WHERE resolved = true;

CREATE INDEX IF NOT EXISTS idx_transactions_user_line_sell
ON transactions(user_id, reference_id)
WHERE type = 'sell';

-- ----------------------------------------------------------------------------
-- STEP 4: Grant execute permissions
-- ----------------------------------------------------------------------------

-- Allow authenticated users to query leaderboard
GRANT EXECUTE ON FUNCTION get_leaderboard TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_leaderboard_stats TO authenticated;

-- Also allow anon for public leaderboard viewing (optional)
GRANT EXECUTE ON FUNCTION get_leaderboard TO anon;

-- ----------------------------------------------------------------------------
-- VERIFICATION QUERIES (run manually to test)
-- ----------------------------------------------------------------------------

/*
-- Test leaderboard
SELECT * FROM get_leaderboard(10, 3);

-- Test user stats
SELECT * FROM get_user_leaderboard_stats('user-uuid-here', 3);
*/

-- ============================================================================
-- END MIGRATION
-- ============================================================================
