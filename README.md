# WatMarket - University Prediction Market

A university-specific prediction market platform where users trade GOOS (virtual points) on yes/no outcomes.

## Stack

- **Backend**: Python FastAPI
- **Database**: Supabase (Postgres + Auth + RLS)
- **Frontend**: React + TypeScript + Vite

## Features

- User registration with Supabase Auth
- Starting GOOS balance (1,000)
- **CPMM (Constant Product Market Maker) Trading Model** (Polymarket-style)
- Buy YES/NO shares with dynamic pricing
- Admin resolution with share redemption (1 Share = 1 GOOS)
- Transaction history & Portfolio tracking

---

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `users` | User profiles with GOOS balance |
| `lines` | Prediction lines with AMM pools (`yes_pool`, `no_pool`) |
| `bets` | User positions (`shares`, `avg_price`, `outcome`) |
| `transactions` | GOOS ledger (buy, payout, initial) |
| `price_history` | Historical prices for charting |

### RLS Policies

- Users can only view their own bets and transactions
- Only admins can create/resolve lines
- Users can only place bets if authenticated

---

## Market Mechanics (CPMM)

WatMarket uses a **Constant Product Market Maker (CPMM)** model, similar to Polymarket or Uniswap, to price outcome shares.

### Pricing
The price of an outcome is determined by the ratio of assets in the pool.
Invariant: `k = yes_pool * no_pool`

```
Price(YES) = no_pool / (yes_pool + no_pool)
Price(NO)  = yes_pool / (yes_pool + no_pool)
```

### Buying Shares
When you spend GOOS to buy YES shares:
1.  Your investment effectively adds liquidity to the **NO** pool (pushing the price of NO down and YES up).
2.  You receive YES shares from the pool based on the curve `x * y = k`.
3.  **Slippage**: Larger trades move the price more, resulting in a higher average cost per share.

### Payout Logic
When a market is resolved:
1.  **Winning Shares** are redeemable for **1.0 GOOS** each.
2.  **Losing Shares** become worthless (0 payout).

**Example:**
- You buy 100 YES shares at an average price of 0.60 (Cost: 60 GOOS).
- **If YES wins**: You receive 100 GOOS. (Profit: +40).
- **If NO wins**: You receive 0. (Loss: -60).
