/**
 * CPMM (Constant Product Market Maker) calculation utilities
 */

export interface PoolState {
  yes_pool: number;
  no_pool: number;
}

/**
 * Calculate estimated shares received for a given investment amount
 */
export function calculateEstimatedShares(
  pool: PoolState,
  investment: number,
  outcome: 'yes' | 'no'
): number {
  if (investment <= 0) return 0;
  
  const k = pool.yes_pool * pool.no_pool;
  
  if (outcome === 'yes') {
    const newNo = pool.no_pool + investment;
    const newYes = k / newNo;
    return investment + (pool.yes_pool - newYes);
  } else {
    const newYes = pool.yes_pool + investment;
    const newNo = k / newYes;
    return investment + (pool.no_pool - newNo);
  }
}

/**
 * Calculate cost required to purchase a specific number of shares
 */
export function calculateCostForShares(
  pool: PoolState,
  shares: number,
  outcome: 'yes' | 'no'
): number {
  if (shares <= 0) return 0;
  
  const Y = outcome === 'yes' ? pool.yes_pool : pool.no_pool;
  const N = outcome === 'yes' ? pool.no_pool : pool.yes_pool;
  
  // Quadratic: I^2 + I(Y+N-S) - SN = 0
  const a = 1;
  const b = Y + N - shares;
  const c = -shares * N;
  
  const delta = b * b - 4 * a * c;
  if (delta < 0) return 0;
  
  return (-b + Math.sqrt(delta)) / (2 * a);
}

/**
 * Calculate value received when selling shares.
 * 
 * Uses "buy opposite outcome" approach (matches Manifold's internal logic):
 * - Selling YES shares = buy the same number of NO shares, then combine
 * - The cost to buy opposite shares is what you "pay" to exit
 * - You receive: shares - cost_to_buy_opposite
 * 
 * This guarantees buy/sell symmetry and eliminates subtle algebra bugs.
 */
export function calculateSellValue(
  pool: PoolState,
  shares: number,
  outcome: 'yes' | 'no'
): number {
  if (shares <= 0) return 0;
  
  // To sell `shares` of `outcome`, compute cost to buy `shares` of opposite outcome
  const oppositeOutcome = outcome === 'yes' ? 'no' : 'yes';
  const costToBuyOpposite = calculateCostForShares(pool, shares, oppositeOutcome);
  
  // When you combine shares of YES + NO, they redeem for 1 each
  // So selling S shares of YES means: buy S shares of NO for cost C,
  // then combine S YES + S NO = S currency units
  // Net received = S - C
  const amountReceived = shares - costToBuyOpposite;
  
  return Math.max(0, amountReceived);
}

/**
 * Calculate average price per share
 */
export function calculateAveragePrice(cost: number, shares: number): number {
  return shares > 0 ? cost / shares : 0;
}
