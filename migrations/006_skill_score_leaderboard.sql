-- ============================================================================
-- MIGRATION: Risk-Adjusted Return (Skill Score) Leaderboard
-- ============================================================================
-- Purpose:
-- Update the leaderboard view to use a more robust skill score calculation
-- based on risk-adjusted returns.
--
-- Formula:
-- Score = ∑log(1 + profit_i / capital_at_risk_i)
--
-- Benefits:
-- - Prevents all-in exploits
-- - Scales fairly across users
-- - Rewards consistency
-- - Industry-standard in trading contexts
-- ============================================================================

-- Drop the existing leaderboard view
DROP VIEW IF EXISTS public.leaderboard;

-- Create the updated leaderboard view with the new skill score calculation
CREATE OR REPLACE VIEW public.leaderboard AS
WITH resolved_market_returns AS (
    -- Calculate profit and capital at risk for each user in each resolved market
    SELECT 
        b.user_id,
        b.line_id,
        sum(b.stake) AS capital_at_risk,
        sum(
            CASE
                WHEN l.correct_outcome = 'invalid'::text THEN 0::double precision
                WHEN l.correct_outcome = b.outcome THEN COALESCE(b.payout, 0::double precision) - b.stake::double precision
                ELSE (- b.stake)::double precision
            END
        ) AS profit
    FROM bets b
    JOIN lines l ON l.id = b.line_id
    WHERE l.resolved = true AND l.correct_outcome IS NOT NULL
    GROUP BY b.user_id, b.line_id
),
skill_scores AS (
    -- Calculate skill score using the risk-adjusted return formula
    SELECT 
        resolved_market_returns.user_id,
        sum(
            CASE
                WHEN resolved_market_returns.capital_at_risk > 0 THEN 
                    ln(1::double precision + GREATEST('-0.99'::numeric::double precision, 
                        LEAST(resolved_market_returns.profit / resolved_market_returns.capital_at_risk::double precision, 10::double precision)))
                ELSE 0::double precision
            END
        ) AS skill_score
    FROM resolved_market_returns
    GROUP BY resolved_market_returns.user_id
),
user_stats AS (
    -- Calculate various user statistics
    SELECT 
        u.id AS user_id,
        u.email,
        u.karma_balance,
        count(DISTINCT b.id) AS total_bets,
        sum(
            CASE
                WHEN l.resolved = true AND l.correct_outcome = b.outcome THEN 1
                ELSE 0
            END
        ) AS wins,
        sum(
            CASE
                WHEN l.resolved = true AND l.correct_outcome <> 'invalid'::text AND l.correct_outcome <> b.outcome THEN 1
                ELSE 0
            END
        ) AS losses,
        sum(
            CASE
                WHEN l.resolved = true AND l.correct_outcome = 'invalid'::text THEN 1
                ELSE 0
            END
        ) AS refunded,
        sum(
            CASE
                WHEN l.resolved = true AND l.correct_outcome = b.outcome THEN COALESCE(b.payout, 0::double precision) - b.stake::double precision
                ELSE 0::double precision
            END
        ) AS profit,
        sum(
            CASE
                WHEN l.resolved = true THEN b.stake
                ELSE 0
            END
        ) AS total_wagered,
        u.created_at
    FROM users u
    LEFT JOIN bets b ON b.user_id = u.id
    LEFT JOIN lines l ON l.id = b.line_id
    GROUP BY u.id, u.email, u.karma_balance, u.created_at
)
SELECT 
    us.user_id,
    us.email,
    us.karma_balance,
    us.total_bets,
    us.wins,
    us.losses,
    us.refunded,
    us.profit,
    us.total_wagered,
    CASE
        WHEN (us.wins + us.losses) > 0 THEN round(us.wins::numeric / (us.wins + us.losses)::numeric * 100::numeric, 2)
        ELSE 0::numeric
    END AS win_rate,
    CASE
        WHEN us.total_wagered > 0 THEN round(us.profit::numeric / us.total_wagered::numeric * 100::numeric, 2)
        ELSE 0::numeric
    END AS roi_percent,
    us.created_at,
    rank() OVER (ORDER BY (COALESCE(ss.skill_score, 0::double precision)) DESC, us.profit DESC) AS rank,
    COALESCE(ss.skill_score, 0::double precision) AS skill_score
FROM user_stats us
LEFT JOIN skill_scores ss ON ss.user_id = us.user_id
WHERE us.total_bets > 0;

-- Add a comment to the view
COMMENT ON VIEW public.leaderboard IS 'Leaderboard with risk-adjusted return (skill score) calculation: Score = ∑log(1 + profit_i / capital_at_risk_i)';

-- ============================================================================
-- END MIGRATION
-- ============================================================================
