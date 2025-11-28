# WatMarket - University Prediction Market

A university-specific prediction market platform where users bet karma on yes/no outcomes.

## Stack

- **Backend**: Python FastAPI
- **Database**: Supabase (Postgres + Auth + RLS)
- **Frontend**: React + TypeScript + Vite

## Features

- User registration with Supabase Auth
- Starting karma balance (1,000)
- Dynamic odds calculation with Laplace smoothing
- Place bets on prediction lines
- Admin resolution with proportional payouts
- Transaction history

---

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `users` | User profiles with karma balance |
| `lines` | Prediction lines (questions) |
| `bets` | Individual bets placed by users |
| `transactions` | Karma transaction history |

### RLS Policies

- Users can only view their own bets and transactions
- Only admins can create/resolve lines
- Users can only place bets if authenticated

---

## Architecture & Implementation

- **Backend (FastAPI + Supabase)**
  - FastAPI app exposes REST endpoints under `/users`, `/lines`, and `/bets`.
  - Supabase Auth handles email/password accounts; a `users` table stores karma balances and `is_admin`.
  - Business logic is split into routers and services:
    - `users`: registration, login, current user, and transaction history.
    - `lines`: CRUD-style operations for prediction lines plus dynamic odds and resolution.
    - `bets`: placing bets, listing a user’s bets, and per-line positions.
  - Supabase Postgres tables (`users`, `lines`, `bets`, `transactions`, `price_history`) hold all state, with RLS enforcing per-user access.

- **Frontend (React + Vite)**
  - React SPA with React Router routes for markets list, line detail, portfolio dashboard, auth pages, and admin create line.
  - `AuthContext` wraps the app, storing the logged-in user and JWT in `localStorage` and attaching it as a Bearer token.
  - A typed Axios client (`api/client.ts`) talks to the FastAPI API, using `VITE_API_URL` as the base URL.
  - Pages use this client to fetch lines, bets, transactions, and to place bets or resolve lines.

- **Interaction flow**
  - Users register/login → receive JWT from backend (Supabase) → frontend stores it.
  - Authenticated requests hit FastAPI, which uses Supabase admin client to read/write Postgres.
  - Betting updates `bets`, adjusts `users.karma_balance`, and appends to `transactions`.
  - Resolving a line computes payouts, updates balances, and writes payout transactions.

---

## Frontend UI Overview

The React frontend provides a trading UI on top of the API:

- **Markets (/**)
  - Lists all prediction lines with status (Active / Resolved / Closed)
  - Shows YES/NO implied probabilities from the dynamic odds
  - Filter by open, resolved, or all markets

- **Market Detail (/lines/:id)**
  - Full question details, volume, closing time, and status
  - Price history chart for YES/NO over time
  - Place YES/NO bets with an estimated payout preview
  - Shows your positions in that market
  - Admins see controls to resolve the market to YES or NO

- **Create Market (/lines/create, admin only)**
  - Form for admins to create new prediction lines with title, description, and closing time

- **Portfolio (/dashboard)**
  - Summary tiles for balance, total bets, and active positions
  - **Positions** tab: table of all bets, each linking back to its market
  - **Transactions** tab: table of all karma transactions (bets, payouts, initial grants)

- **Auth (/login, /register)**
  - Email/password registration and login
  - Auth state is stored in localStorage and sent as a Bearer token to the API

## Odds Formula

Dynamic odds using Laplace smoothing:

```
P_yes = (yes_stake + 10) / (yes_stake + no_stake + 20)
P_no  = (no_stake + 10) / (yes_stake + no_stake + 20)

odds_yes = 1 / P_yes
odds_no  = 1 / P_no
```

**Example:**
- yes_stake = 500, no_stake = 300
- P_yes = 510/820 = 0.622 (62.2%)
- P_no = 310/820 = 0.378 (37.8%)
- odds_yes = 1.61x
- odds_no = 2.64x

---

## Payout Logic

When a line is resolved:

1. Identify winning and losing bets
2. Sum all losing stakes (the "pot")
3. Distribute pot proportionally to winners based on stake size
4. Each winner receives: `original_stake + (stake/total_winning_stake) * losing_pot`

---
