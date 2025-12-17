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
 * Calculate value received when selling shares
 */
export function calculateSellValue(
  pool: PoolState,
  shares: number,
  outcome: 'yes' | 'no'
): number {
  if (shares <= 0) return 0;
  
  const { yes_pool, no_pool } = pool;
  
  // Quadratic formula: c^2 - c(yes + s + no) + s*pool = 0
  const a = 1;
  const b = -(yes_pool + shares + no_pool);
  const c_term = shares * (outcome === 'yes' ? no_pool : yes_pool);
  
  const discriminant = b * b - 4 * a * c_term;
  if (discriminant < 0) return 0;
  
  const amount = (-b - Math.sqrt(discriminant)) / (2 * a);
  return Math.max(0, amount);
}

/**
 * Calculate average price per share
 */
export function calculateAveragePrice(cost: number, shares: number): number {
  return shares > 0 ? cost / shares : 0;
}
