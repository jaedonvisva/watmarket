-- ============================================================================
-- MIGRATION: Add Slippage Protection to Trading RPCs
-- ============================================================================
-- This migration adds required slippage protection parameters to the atomic
-- trading functions, following industry best practices (Uniswap, Manifold).
--
-- Changes:
--   - place_bet_atomic: adds p_min_shares_out (required)
--   - sell_shares_atomic: adds p_min_amount_out (required)
--
-- The transaction will REVERT if the actual output is below the minimum,
-- protecting users from front-running and stale quotes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1: Replace place_bet_atomic with slippage protection
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.place_bet_atomic(
  p_user_id uuid, 
  p_line_id uuid, 
  p_outcome text, 
  p_stake integer,
  p_min_shares_out double precision  -- NEW: minimum shares user will accept
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_balance integer;
  v_line record;
  v_shares float8;
  v_new_yes_pool float8;
  v_new_no_pool float8;
  v_k float8;
  v_bet_id uuid;
  v_buy_price float8;
  result json;
BEGIN
  -- Validate slippage parameter
  IF p_min_shares_out IS NULL OR p_min_shares_out <= 0 THEN
    RAISE EXCEPTION 'min_shares_out must be positive';
  END IF;

  -- Lock user row for update
  SELECT karma_balance INTO v_user_balance
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Check balance
  IF v_user_balance < p_stake THEN
    RAISE EXCEPTION 'Insufficient balance: have %, need %', v_user_balance, p_stake;
  END IF;
  
  -- Lock line for update
  SELECT * INTO v_line
  FROM lines
  WHERE id = p_line_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Line not found';
  END IF;
  
  -- Check line is open
  IF v_line.resolved THEN
    RAISE EXCEPTION 'Line is resolved';
  END IF;
  
  IF v_line.closes_at <= NOW() THEN
    RAISE EXCEPTION 'Betting closed';
  END IF;
  
  -- Calculate CPMM
  v_k := v_line.yes_pool * v_line.no_pool;
  
  IF p_outcome = 'yes' THEN
    v_new_no_pool := v_line.no_pool + p_stake;
    v_new_yes_pool := v_k / v_new_no_pool;
    v_shares := p_stake + (v_line.yes_pool - v_new_yes_pool);
  ELSIF p_outcome = 'no' THEN
    v_new_yes_pool := v_line.yes_pool + p_stake;
    v_new_no_pool := v_k / v_new_yes_pool;
    v_shares := p_stake + (v_line.no_pool - v_new_no_pool);
  ELSE
    RAISE EXCEPTION 'Invalid outcome: must be yes or no';
  END IF;
  
  -- Validate pools are positive
  IF v_new_yes_pool <= 0 OR v_new_no_pool <= 0 THEN
    RAISE EXCEPTION 'Pool calculation error: yes=%, no=%', v_new_yes_pool, v_new_no_pool;
  END IF;
  
  -- =========================================================================
  -- SLIPPAGE CHECK: Revert if shares received is below minimum
  -- =========================================================================
  IF v_shares < p_min_shares_out THEN
    RAISE EXCEPTION 'Slippage exceeded: would receive % shares, minimum is %', 
      ROUND(v_shares::numeric, 4), ROUND(p_min_shares_out::numeric, 4);
  END IF;
  
  -- Calculate buy price
  v_buy_price := CASE WHEN v_shares > 0 THEN p_stake::float8 / v_shares ELSE 0 END;
  
  -- Update user balance
  UPDATE users 
  SET karma_balance = karma_balance - p_stake
  WHERE id = p_user_id;
  
  -- Update pools
  UPDATE lines
  SET yes_pool = v_new_yes_pool,
      no_pool = v_new_no_pool,
      volume = COALESCE(volume, 0) + p_stake
  WHERE id = p_line_id;
  
  -- Create bet
  INSERT INTO bets (user_id, line_id, outcome, stake, shares, buy_price)
  VALUES (p_user_id, p_line_id, p_outcome, p_stake, v_shares, v_buy_price)
  RETURNING id INTO v_bet_id;
  
  -- Create transaction
  INSERT INTO transactions (user_id, amount, type, reference_id)
  VALUES (p_user_id, -p_stake, 'bet', v_bet_id);
  
  -- Return result
  SELECT json_build_object(
    'bet_id', v_bet_id,
    'shares', v_shares,
    'buy_price', v_buy_price,
    'new_balance', v_user_balance - p_stake,
    'min_shares_out', p_min_shares_out
  ) INTO result;
  
  RETURN result;
END;
$function$;

-- ----------------------------------------------------------------------------
-- STEP 2: Replace sell_shares_atomic with slippage protection
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sell_shares_atomic(
  p_user_id uuid, 
  p_line_id uuid, 
  p_outcome text, 
  p_shares double precision,
  p_min_amount_out double precision  -- NEW: minimum GOOS user will accept
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_line record;
  v_total_shares float8;
  v_amount_received float8;
  v_new_yes_pool float8;
  v_new_no_pool float8;
  v_a float8;
  v_b float8;
  v_c float8;
  v_discriminant float8;
  v_sell_price float8;
  v_new_balance integer;
  v_amount_int integer;
  v_remaining_to_reduce float8;
  v_bet record;
  v_reduce_amount float8;
  v_line_title text;
  result json;
BEGIN
  -- Validate outcome
  IF p_outcome NOT IN ('yes', 'no') THEN
    RAISE EXCEPTION 'Invalid outcome: must be yes or no';
  END IF;

  -- Validate slippage parameter
  IF p_min_amount_out IS NULL OR p_min_amount_out <= 0 THEN
    RAISE EXCEPTION 'min_amount_out must be positive';
  END IF;

  -- Lock line for update
  SELECT * INTO v_line
  FROM lines
  WHERE id = p_line_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Line not found';
  END IF;
  
  v_line_title := v_line.title;
  
  -- Check line is not resolved
  IF v_line.resolved THEN
    RAISE EXCEPTION 'Cannot sell shares on resolved market';
  END IF;

  -- Get user's total shares for this position
  SELECT COALESCE(SUM(shares), 0) INTO v_total_shares
  FROM bets
  WHERE user_id = p_user_id 
    AND line_id = p_line_id 
    AND outcome = p_outcome
    AND payout IS NULL
    AND shares > 0;
  
  IF v_total_shares < p_shares THEN
    RAISE EXCEPTION 'Insufficient shares: have %, want to sell %', v_total_shares, p_shares;
  END IF;

  -- Calculate CPMM sell using quadratic formula
  IF p_outcome = 'yes' THEN
    v_a := 1;
    v_b := -(v_line.yes_pool + p_shares + v_line.no_pool);
    v_c := p_shares * v_line.no_pool;
    
    v_discriminant := v_b * v_b - 4 * v_a * v_c;
    
    IF v_discriminant < 0 THEN
      RAISE EXCEPTION 'Invalid sell calculation';
    END IF;
    
    v_amount_received := (-v_b - sqrt(v_discriminant)) / (2 * v_a);
    v_new_yes_pool := v_line.yes_pool + (p_shares - v_amount_received);
    v_new_no_pool := v_line.no_pool - v_amount_received;
  ELSE
    v_a := 1;
    v_b := -(v_line.no_pool + p_shares + v_line.yes_pool);
    v_c := p_shares * v_line.yes_pool;
    
    v_discriminant := v_b * v_b - 4 * v_a * v_c;
    
    IF v_discriminant < 0 THEN
      RAISE EXCEPTION 'Invalid sell calculation';
    END IF;
    
    v_amount_received := (-v_b - sqrt(v_discriminant)) / (2 * v_a);
    v_new_no_pool := v_line.no_pool + (p_shares - v_amount_received);
    v_new_yes_pool := v_line.yes_pool - v_amount_received;
  END IF;

  -- Validate pools are positive
  IF v_new_yes_pool <= 0 OR v_new_no_pool <= 0 THEN
    RAISE EXCEPTION 'Pool calculation error: yes=%, no=%', v_new_yes_pool, v_new_no_pool;
  END IF;

  v_amount_int := FLOOR(v_amount_received)::integer;
  
  IF v_amount_int <= 0 THEN
    RAISE EXCEPTION 'Sell amount too small';
  END IF;

  -- =========================================================================
  -- SLIPPAGE CHECK: Revert if amount received is below minimum
  -- =========================================================================
  IF v_amount_received < p_min_amount_out THEN
    RAISE EXCEPTION 'Slippage exceeded: would receive % GOOS, minimum is %', 
      ROUND(v_amount_received::numeric, 2), ROUND(p_min_amount_out::numeric, 2);
  END IF;

  v_sell_price := v_amount_received / p_shares;

  -- Update pools
  UPDATE lines
  SET yes_pool = v_new_yes_pool,
      no_pool = v_new_no_pool,
      volume = COALESCE(volume, 0) + v_amount_int
  WHERE id = p_line_id;

  -- Update user balance
  UPDATE users 
  SET karma_balance = karma_balance + v_amount_int
  WHERE id = p_user_id
  RETURNING karma_balance INTO v_new_balance;

  -- Reduce shares from existing bets (FIFO order)
  v_remaining_to_reduce := p_shares;
  
  FOR v_bet IN 
    SELECT id, shares 
    FROM bets
    WHERE user_id = p_user_id 
      AND line_id = p_line_id 
      AND outcome = p_outcome
      AND payout IS NULL
      AND shares > 0
    ORDER BY created_at
  LOOP
    IF v_remaining_to_reduce <= 0 THEN
      EXIT;
    END IF;
    
    v_reduce_amount := LEAST(v_bet.shares, v_remaining_to_reduce);
    
    UPDATE bets
    SET shares = shares - v_reduce_amount
    WHERE id = v_bet.id;
    
    v_remaining_to_reduce := v_remaining_to_reduce - v_reduce_amount;
  END LOOP;

  -- Create transaction record WITH metadata
  INSERT INTO transactions (user_id, amount, type, reference_id, metadata)
  VALUES (
    p_user_id, 
    v_amount_int, 
    'sell', 
    p_line_id,
    jsonb_build_object(
      'shares', p_shares,
      'outcome', p_outcome,
      'sell_price', v_sell_price,
      'line_title', v_line_title,
      'min_amount_out', p_min_amount_out
    )
  );

  -- Return result
  SELECT json_build_object(
    'shares_sold', p_shares,
    'amount_received', v_amount_received,
    'sell_price', v_sell_price,
    'new_balance', v_new_balance,
    'remaining_shares', v_total_shares - p_shares,
    'min_amount_out', p_min_amount_out
  ) INTO result;
  
  RETURN result;
END;
$function$;

-- ============================================================================
-- END MIGRATION
-- ============================================================================
