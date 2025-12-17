# WatMarket

WatMarket is a university-focused prediction market where users trade **GOOS** (virtual points) on **binary (YES/NO)** outcomes.

The core goal of the project is to model real prediction-market dynamics (pricing, slippage, and position liquidation) while staying in a **play-money** environment.

## Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Python + FastAPI
- **Database**: Supabase (Postgres + Auth + Row Level Security)

## High-level flow

- **Auth**: Users register/login via Supabase Auth; the frontend stores the returned access token and sends it as a Bearer token.
- **Markets**: Admins create markets (“lines”) with an initial CPMM liquidity seed.
- **Trading**:
  - Users buy YES/NO shares by spending GOOS.
  - Prices update automatically based on pool balances.
  - Users can sell shares back into the pool before resolution.
- **Resolution**: Admin resolves a market to YES or NO; winning shares pay out.
- **Portfolio**: The app shows positions and portfolio summary with consistent liquidation semantics.

## Repository layout

- `frontend/`: React app
- `backend/`: FastAPI app
- `AUDIT_REPORT.md`: security/performance review and database migration guidance
- `ROADMAP.md`: planned features

## Local development

### Prerequisites

- Node.js + npm
- Python 3
- A Supabase project (URL + keys)

### Backend (FastAPI)

From `backend/`:

1. Create and activate a virtual environment.
2. Install dependencies.
3. Create `backend/.env`:

   - `SUPABASE_URL=...`
   - `SUPABASE_ANON_KEY=...`
   - `SUPABASE_SERVICE_ROLE_KEY=...`

4. Run the API server.

The API serves Swagger docs at `/docs`.

### Frontend (React)

From `frontend/`:

1. Install dependencies.
2. Create `frontend/.env`:

   - `VITE_API_URL=http://localhost:8000`

3. Start the dev server.

## Database schema (conceptual)

Primary tables used by the app:

- **`users`**: profile + `karma_balance` (GOOS cash)
- **`lines`**: market metadata + pool state (`yes_pool`, `no_pool`), plus `resolved` and `correct_outcome`
- **`bets`**: buy trades (stake, shares, outcome, payout)
- **`transactions`**: ledger events (including sells)
- **`price_history`**: historical implied prices

Row Level Security (RLS) is used so that users can only see their own private records.

## Market mechanics (CPMM)

WatMarket uses a **Constant Product Market Maker (CPMM)** for binary markets.

### Pools and invariant

Each market has two pools:

- `yes_pool`
- `no_pool`

The CPMM invariant is:

`k = yes_pool * no_pool`

### Implied probability / price

The app uses pool ratios to compute implied prices:

```
Price(YES) = no_pool / (yes_pool + no_pool)
Price(NO)  = yes_pool / (yes_pool + no_pool)
```

These are shown as percentages in the UI.

### Buying shares

When a user spends `I` GOOS to buy an outcome, the pool moves along the `x*y=k` curve.

Let `k = yes_pool * no_pool`.

Buying YES with investment `I`:

```
new_no  = no_pool + I
new_yes = k / new_no

shares_bought = I + (yes_pool - new_yes)
```

Buying NO is symmetric.

### Selling shares (buy-opposite method)

WatMarket values sells using a symmetry trick (commonly used in production CPMMs):

To sell `S` shares of YES:

1. Compute the **cost to buy `S` shares of NO** at current pools.
2. Redeem the combined YES+NO bundle at `1` per share.

So:

```
sell_value(S, YES) = S - cost_to_buy_shares(S, NO)
sell_value(S, NO)  = S - cost_to_buy_shares(S, YES)
```

The **cost_to_buy_shares** is solved from the CPMM equations (quadratic), and this “buy-opposite” structure guarantees buy/sell symmetry.

### Resolution and payout

Markets resolve to either YES or NO.

- Winning shares pay **1 GOOS per share**.
- Losing shares pay 0.

Example:

- Buy 100 YES shares for 60 GOOS total.
- If YES wins: payout = 100 GOOS (profit +40).
- If NO wins: payout = 0 (loss -60).

## Portfolio and P&L accounting

The app uses a single definition of “value” everywhere:

> **Position value = CPMM liquidation value** (what you would receive if you sold now)

### Positions endpoint

Positions are aggregated by `(line_id, outcome)`:

- `total_cost` = sum of stakes
- `total_shares` = sum of shares
- For open markets: `current_value = calculate_cpmm_sell(total_shares, ...)`
- For resolved markets: `current_value = sum(payout)`

### Portfolio summary endpoint

Portfolio summary now matches the same aggregation semantics as positions:

- Aggregate by `(line_id, outcome)`
- Compute liquidation value once per aggregated position
- Sum those values

Returned metrics:

- `cash_balance` = current GOOS cash (`users.karma_balance`)
- `invested_value` = cost basis of active positions
- `positions_value` = liquidation value of active positions
- `total_portfolio_value = cash_balance + positions_value`
- `total_pnl = total_returned - total_invested` (includes resolved + open)

## API overview

Key endpoints:

- `POST /users/register`, `POST /users/login`, `GET /users/me`
- `GET /lines`, `GET /lines/{id}`, `POST /lines` (admin), `POST /lines/{id}/resolve` (admin)
- `POST /bets/place`, `POST /bets/sell`
- `GET /bets/positions`, `GET /bets/portfolio`

## Security / audit notes

See `AUDIT_REPORT.md` for a detailed review of:

- database constraints and RLS
- atomic trading functions
- precision concerns (float vs numeric)
- recommended migrations and hardening steps
