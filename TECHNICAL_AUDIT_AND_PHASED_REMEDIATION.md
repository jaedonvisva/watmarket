# WatMarket Technical Audit & Phased Remediation Plan

**Scope:** full-stack audit of `frontend/` (React+TS), `backend/` (FastAPI), `migrations/` (Postgres/Supabase), and Supabase Auth/RLS integration.

**Context:** WatMarket is a **play-money** prediction market using **binary CPMM shares** (Manifold-style) with:
- Markets: `lines` (YES/NO, pools, closes_at, resolved, correct_outcome)
- Buys: atomic RPC `place_bet_atomic`
- Sells: atomic RPC `sell_shares_atomic`
- Resolution: atomic RPC `resolve_line_atomic`
- Invalidation: atomic RPC `resolve_line_invalid_atomic`

This document consolidates:
- What is implemented vs industry best practices
- Why gaps matter
- A phased, file-level change plan with test gates
- A release checklist

References:
- `AUDIT_REPORT.md` (automated audit + SQL hardening suggestions)
- `ROADMAP.md` (product roadmap)

---

## 1) Current Feature Set (As Implemented)

### 1.1 Market Lifecycle
- **Create:** Admin-only via `POST /lines` (frontend: `CreateLine.tsx`)
- **Trade:** Users buy/sell shares while `now < closes_at` and `resolved=false`
- **Close:** Trading stops after `closes_at` (enforced in buy RPC)
- **Resolve:** Admin resolves YES/NO (frontend: `Admin.tsx`, backend: `lines.py` → `resolver.py` → `resolve_line_atomic`)
- **Invalidate/Cancel:** Admin invalidates and refunds net investment (migration `001_invalid_resolution.sql`)

### 1.2 Trading & Accounting Model
- **AMM:** constant product (CPMM) shares-based market
- **Price display:** `p_yes = no_pool / (yes_pool + no_pool)`
- **Sell valuation:** “buy opposite outcome” symmetry approach
- **Portfolio:** liquidation value for open positions + ledger-based realized P&L

---

## 2) Best-Practices Comparison (Feature-by-Feature)

Legend:
- **Present** = implemented and generally correct
- **Partially implemented** = present but incomplete / missing critical constraints
- **Missing** = not implemented
- **Incorrect** = implemented but materially wrong

### 2.1 Market Types
| Item | Status | Notes |
|---|---:|---|
| Binary (YES/NO) | Present | Core market type is implemented end-to-end |
| Categorical (N-way) | Missing | Requires schema changes + UI + different AMM or generalized CPMM |
| Scalar / numeric | Missing | Requires specialized market math + resolution rules |
| Range buckets | Missing | Could be implemented as categorical buckets |
| Combinatorial / conditional | Missing | Advanced; requires compositional outcome modeling |

### 2.2 Trading Mechanisms
| Item | Status | Notes |
|---|---:|---|
| CPMM shares AMM | Present | Implemented in backend + frontend |
| LMSR | Missing | Not implemented |
| Orderbook (limit orders) | Missing | Not implemented |
| Hybrid AMM+orderbook | Missing | Not implemented |
| Slippage bounds (min shares / max price) | Missing | UI estimates exist, but execution has no user-provided protection |
| Trading fees | Missing | No fee model; volume can be gamed |
| Liquidity providers (LP shares) | Missing | Only admin initial liquidity; no LP accounting |

### 2.3 Resolution / Oracle / Disputes
| Item | Status | Notes |
|---|---:|---|
| Admin resolution | Present | Single-admin authority; works but high integrity risk |
| Explicit resolution source stored | Partially implemented | Only free-form description; no structured rules/source URL |
| Dispute window | Missing | No propose/challenge flow |
| Bonded proposer/challenger | Missing | No economic security around resolution |
| Appeal/escalation | Missing | No court/quorum |
| Invalidation (cancel + refund) | Present | Implemented via `resolve_line_invalid_atomic` |

### 2.4 UX / Ops / Analytics
| Item | Status | Notes |
|---|---:|---|
| Clear market status (open/closed/resolved/cancelled) | Partially implemented | UI shows cancelled in `LineDetail.tsx` but list views may not distinguish |
| Portfolio & trade history | Present | Positions + trade history implemented |
| Telemetry / analytics events | Missing | No defined event schema |
| Market health dashboards | Missing | No SQL-based dashboards wired |
| Rate limits / abuse controls | Missing | No backend rate limiting identified |

---

## 3) Key Risks (Why They Matter)

### 3.1 Integrity risk: oracle is a single admin
- A compromised admin account can resolve markets incorrectly.
- Lack of dispute path undermines user trust.

### 3.2 Security risk: backend uses service-role for user flows
- Using the Supabase **service role** for routine user requests bypasses RLS.
- Any future backend authorization bug becomes **full data exposure**.

### 3.3 Financial correctness risk: float precision + payout rounding
- Pools and shares being floats can drift over time.
- Rounding payouts breaks the “1 share → 1 GOOS” redemption contract.

### 3.4 UX correctness risk: resolved losing bets counted as open
- `frontend/src/pages/LineDetail.tsx` filters open bets using `!b.payout`, which treats `payout=0` as open.

---

## 4) Phased Remediation Plan (What to change, in order)

This plan is designed to ship improvements safely without destabilizing production.

### Phase 0 — Immediate guardrails (0–2 days)
**Goal:** remove obvious correctness bugs and prevent user harm.

**Status:** ✅ Complete

#### Changes
- [x] **Fix open-position filtering bug**
  - **File:** `frontend/src/pages/LineDetail.tsx`
  - **Change:** treat open bets as `payout === null || payout === undefined` rather than `!payout`.

- [x] **Make “cancelled/invalid” status consistent**
  - **Files:**
    - `frontend/src/pages/Markets.tsx`
    - `frontend/src/pages/Admin.tsx`
  - **Change:** show distinct badge for `correct_outcome === 'invalid'`.

- [x] **Add slippage protection (API contract)**
  - **Files:**
    - `backend/app/models/schemas.py`
    - `backend/app/routers/bets.py`
    - DB function: `place_bet_atomic` and `sell_shares_atomic`
  - **Change:** accept `min_shares_out` (buy) / `min_amount_out` (sell) and enforce in DB.
  - **Migrations:**
    - `migrations/002_slippage_protection.sql`
    - `migrations/003_drop_legacy_trade_rpcs.sql`
    - `migrations/004_align_sell_slippage_rounding.sql`

#### Tests / gates
- [x] Unit tests for CPMM functions using the test vectors in §5.
  - `frontend/src/utils/cpmm.test.ts`
- [ ] Integration test: stale quote scenario should fail when slippage threshold is exceeded.

#### “Done” criteria
- [x] No UI shows resolved losing positions as sellable.
- [x] Trades can include a user-provided slippage limit that is enforced by the DB function.

---

### Phase 1 — Security baseline (3–7 days)
**Goal:** reduce blast radius and harden the system for real users.

#### Changes
- **Stop using Supabase service-role for user-scoped reads/writes**
  - **Files:**
    - `backend/app/services/auth.py`
    - `backend/app/database.py`
    - Routers: `backend/app/routers/*.py`
  - **Approach:**
    - Verify JWT via Supabase auth.
    - For DB operations that should be RLS-governed, use a client configured to execute with the user’s JWT.
    - Keep service role only for:
      - admin-only endpoints
      - security-definer RPCs with internal checks

- **Add rate limiting**
  - **Targets:**
    - `POST /users/login`
    - `POST /users/register`
    - `POST /bets/place`
    - `POST /bets/sell`

- **Harden DB functions**
  - Ensure SECURITY DEFINER functions set a fixed search path:
    - `... SECURITY DEFINER SET search_path TO 'public'`

#### Tests / gates
- Attempt to access another user’s bets/transactions via the API should fail.
- Load test: repeated login attempts are throttled.

#### “Done” criteria
- RLS meaningfully constrains user-scoped queries.
- Rate limiting prevents trivial abuse.

---

### Phase 2 — Financial correctness (1–3 weeks)
**Goal:** eliminate precision drift and ensure accounting matches the economic rules.

#### Changes
- **Migrate float → numeric for financial columns**
  - **DB:** convert pools/shares/prices/payout to `numeric(p,s)`.
  - **Backend:** use `Decimal` for calculations and serialization.
  - **Frontend:** keep JS numbers but display with consistent rounding; treat backend as authority.

- **Remove payout rounding**
  - **DB:** stop `ROUND(v_payout)` for payouts.
  - If currency must be integer:
    - Store shares in fixed-point integer units (e.g. 1e6) OR
    - Store payouts as numeric and display as decimals.

- **Add reconciliation checks**
  - A periodic job/check that:
    - validates pool positivity
    - checks invariant drift tolerances
    - validates ledger sums vs balance deltas

#### Tests / gates
- Property tests: immediate buy→sell round trip approximately equals original investment.
- 1,000 sequential small trades: invariant drift within acceptable tolerance.

#### “Done” criteria
- No systematic loss due to rounding.
- Pools/shares remain stable and auditable.

---

### Phase 3 — Market integrity (oracles & disputes) (3–6 weeks)
**Goal:** make resolution credible and operationally safe.

#### Changes
- **Structured resolution rules**
  - Add fields like:
    - `resolution_source_url`
    - `resolution_criteria`
    - `timezone`
    - `allowed_sources[]`

- **Dispute window (v0)**
  - Add:
    - `resolution_proposals`
    - `resolution_challenges`
  - Enforce time windows in DB.

- **Admin quorum (optional)**
  - Require 2-of-N approvals for resolution.

#### Tests / gates
- Simulate:
  - propose → challenge → finalize
  - late challenge rejected
  - conflicting proposals

#### “Done” criteria
- Every resolved market has a stored source/rules.
- Users have a dispute path and clear time windows.

---

### Phase 4 — Fees, liquidity, and market expansion (6+ weeks)
**Goal:** improve market quality and scalability.

#### Changes
- **Trading fees + treasury accounting**
- **LP accounting** (track initial liquidity as subsidy or implement LP shares)
- **New market types** (categorical → scalar)
- **Analytics** (Brier score, OI, market health metrics)

---

## 5) Financial Math: Test Vectors (Use in unit tests)

Use these vectors in both:
- `backend` unit tests (pytest)
- `frontend` unit tests (vitest) for `frontend/src/utils/cpmm.ts`

### Vector A — Buy YES from symmetric pool
- Pools: yes=100, no=100
- Buy: I=10 on YES
- Expected:
  - new_no = 110
  - new_yes ≈ 90.9090909091
  - shares ≈ 19.0909090909

### Vector B — Post-buy implied price
- Pools: yes≈90.9090909091, no=110
- Expected:
  - p_yes ≈ 110 / (90.9090909091 + 110) ≈ 0.5475113122

### Vector C — Immediate sell symmetry
- Sell S=19.0909090909 YES from pools in Vector A
- Expected:
  - sell_value ≈ 10

### Vector D — Cost-to-buy-shares symmetry
- Pools: yes=100, no=100
- Target shares S=19.0909090909 YES
- Expected:
  - cost ≈ 10

### Vector E — Monotonicity
- Pools: yes=100, no=100
- Compare buys I=10 vs I=20
- Expected:
  - shares(20) > shares(10)
  - avg_price(20) > avg_price(10)

---

## 6) Release Checklist (Pre-public Launch)

### Security
- Confirm service role key is never exposed to frontend or logs.
- Confirm RLS policies are real and enforced for user-scoped operations.
- Add rate limits for auth and trading.
- Add audit logging for admin resolution actions.

### Market Integrity
- Market creation requires structured resolution criteria and a source URL.
- Add a dispute window (even a minimal one) or explicitly document “admin final”.

### Financial Correctness
- Use exact/fixed precision for pools/shares/payouts.
- Remove payout rounding loss.
- Add unit + property tests to CI.

### Ops
- Add dashboards/queries for:
  - active markets, volume, price history health
  - error rates and latency
  - suspicious trading patterns

### Legal / Policy (even play-money)
- Terms of use: no cash value, no real-money payouts.
- Content moderation policy.

---

## 7) Open Items / Needed Inputs

To produce a fully grounded security analysis of RLS and schema correctness, we still need the **actual base schema migrations** (table DDL + policies) beyond `001_invalid_resolution.sql`.

Recommended next step:
- Export schema-only SQL (sanitized) or add the initial migrations into `migrations/`.
