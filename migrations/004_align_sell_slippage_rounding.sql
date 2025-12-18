-- ============================================================================
-- MIGRATION: Align Sell Slippage Checks With Integer Payout Rounding
-- ============================================================================
-- sell_shares_atomic currently credits users with FLOOR(v_amount_received)::int
-- but slippage checks compared against the pre-floor float.
--
-- This migration aligns execution guarantees with what the user actually
-- receives by enforcing slippage against the integer credited amount.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sell_shares_atomic(
  p_user_id uuid,
  p_line_id uuid,
  p_outcome text,
  p_shares double precision,
  p_min_amount_out double precision
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

  -- Enforce integer semantics (matches credited amount)
  IF p_min_amount_out <> FLOOR(p_min_amount_out) THEN
    RAISE EXCEPTION 'min_amount_out must be an integer';
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

  -- SLIPPAGE CHECK (aligned with credited integer amount)
  IF v_amount_int < p_min_amount_out::integer THEN
    RAISE EXCEPTION 'Slippage exceeded: would receive % GOOS, minimum is %',
      v_amount_int, p_min_amount_out::integer;
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
      'min_amount_out', p_min_amount_out::integer
    )
  );

  -- Return result (amount_received is what user actually received)
  SELECT json_build_object(
    'shares_sold', p_shares,
    'amount_received', v_amount_int,
    'sell_price', v_sell_price,
    'new_balance', v_new_balance,
    'remaining_shares', v_total_shares - p_shares,
    'min_amount_out', p_min_amount_out::integer
  ) INTO result;

  RETURN result;
END;
$function$;

-- ============================================================================
-- END MIGRATION
-- ============================================================================
