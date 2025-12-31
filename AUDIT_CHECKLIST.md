# WatMarket — Consolidated Audit Checklist (Security + Technical)

This document consolidates the actionable items from:
- PREDICTION_MARKET_SECURITY_AUDIT.md
- TECHNICAL_AUDIT_AND_PHASED_REMEDIATION.md

Statuses reflect the latest evidence in-repo and the notes inside those audits.

Legend:
- Status: Completed, Mitigated, Partially Completed, Remaining
- Source: SA = Security Audit, TA = Technical Audit

---

## A) Critical Security Items

- [Completed] PUBLIC EXECUTE on SECURITY DEFINER RPCs revoked
  - Source: SA §Public EXECUTE
  - Evidence: Live Supabase shows EXECUTE restricted to postgres + service_role for place_bet_atomic, sell_shares_atomic, resolve_line_atomic, resolve_line_invalid_atomic.
  - Risk now: direct public RPC exploitation blocked.

- [Completed] Self-admin escalation via users UPDATE policy
  - Source: SA §Self-admin escalation
  - Evidence: Policy dropped + trigger prevents `users.is_admin` changes except service role.

- [Completed] Unrestricted INSERT into transactions/users (public policies)
  - Source: SA §Unrestricted INSERT
  - Evidence: Policies changed to `TO service_role`; reads limited to `authenticated`.

- [Completed] RPC trusted client-supplied `p_user_id`
  - Source: SA §p_user_id
  - Evidence: Risk eliminated by revoking public EXECUTE; backend still passes `p_user_id` under service_role. Optional future improvement: derive from auth in DB if ever re-exposed.

- [Completed] Resolution/invalid RPCs lacked admin checks
  - Source: SA §Admin checks
  - Evidence: Added explicit admin checks inside resolve_line_atomic and resolve_line_invalid_atomic; EXECUTE revoked from public. Defense-in-depth now in place.

- [Completed] Rate limit X-Forwarded-For spoofing
  - Source: SA §Rate limit bypass
  - Evidence: backend/app/rate_limit.py trusts XFF only when enabled and from trusted proxies; configurable settings.

---

## B) High/Medium Security and Correctness

- [Completed] NaN/Infinity handling in slippage parameters
  - Source: SA §NaN/Infinity
  - Evidence: API schemas enforce `math.isfinite`; DB-level isfinite/NaN guards added to place_bet_atomic and sell_shares_atomic with explicit exceptions.

- [Completed] Resolution rounding mismatch (float shares, ROUND at payout)
  - Source: SA §Resolution rounding; TA Phase 2
  - Evidence: `resolve_line_atomic` updated to use `FLOOR(shares)::INTEGER` to match sell logic and avoid rounding up fractional shares. Payouts are now conservative and consistent.

- [Completed] Frontend/Backend CPMM divergence risk
  - Source: SA §FE/BE divergence; TA §5 tests
  - Evidence: Implemented `GET /bets/quote` endpoint (backend authoritative) and updated frontend `LineDetail` to consume it; removed reliance on client-side math for price display.

- [Remaining] Auth: leaked password protection disabled (and admin MFA)
  - Source: SA §Auth advisors
  - Work: Enable in Supabase Auth dashboard; enforce MFA for admins.

---

## C) Technical Audit Phases (Roll-up)

- Phase 0 — Immediate guardrails
  - [Completed] Fix open-position filtering bug (UI treats payout=0 correctly)
  - [Completed] Consistent invalid/cancelled status in FE list views
  - [Completed] Slippage protection contract
    - FE/BE schemas added; DB enforcement and isfinite guards added to RPCs; CI integ test still recommended.

- Phase 1 — Security baseline
  - [Completed] Stop using service-role for user-scoped reads/writes
    - Evidence: Routers use `get_jwt_client(token)` for reads. Writes to `bets`/`transactions` go through RPCs (using service role), which is required as RPCs are now internal-only (revoked public execute). This is the correct secure pattern.
  - [Completed] Add rate limiting for auth/trading endpoints
    - Evidence: rate_limit.py present with per-IP limits and hardened XFF.
  - [Completed] SECURITY DEFINER functions should set fixed search_path
    - Evidence: All core RPCs and calculate_cpmm_price now specify `SET search_path TO public`.

- Phase 2 — Financial correctness
  - [Completed] Migrate float → numeric for financial columns (DB + Decimal in BE)
  - Evidence: Financial columns now numeric in DB; backend uses Decimal; migrations updated RPCs accordingly.
  - [Completed] Remove payout rounding inconsistency
    - Evidence: `resolve_line_atomic` now uses `FLOOR` to align with sell logic.
  - [Remaining] Add reconciliation job + invariants

- Phase 3 — Market integrity (oracles & disputes)
  - [Partially Completed] Structured resolution fields
    - Evidence: Added `resolution_source_url` and `resolution_criteria` to `lines` table.
  - [Remaining] Dispute window v0 (propose/challenge)
  - [Optional/Remaining] Admin quorum 2-of-N

- Phase 4 — Fees/liquidity/expansion
  - [Remaining] Trading fees and treasury accounting
  - [Remaining] LP accounting or subsidy modeling
  - [Remaining] Additional market types and analytics

---

## D) Verification Notes (from repo)

- backend/app/models/schemas.py
  - `BetCreate.min_shares_out` and `SellSharesRequest.shares` validated with `math.isfinite`.
- backend/app/rate_limit.py
  - Uses SlowAPI; IP key from `get_client_ip`; XFF trusted only with `trust_x_forwarded_for` and `trusted_proxy_ips` containing the remote IP.

If desired, I can grep migrations/SQL to confirm function ACLs, search_path, and presence of DB-level slippage checks.

---

## E) Actionable Next Steps (shortlist)

- [ ] Enable leaked-password protection and enforce admin MFA in Supabase Auth.
- [ ] Stop using service-role for user-scoped reads/writes; use user JWT for RLS-bound operations.
- [ ] Remove payout rounding inconsistency or align with sell rounding.
- [ ] Add reconciliation job and invariants (pool positivity, ledger vs balances).
- [ ] Implement backend-authoritative quote endpoint and FE/BE invariant tests.
- [ ] Add structured resolution fields and minimal dispute window.
- [ ] Add CI assertions: anon cannot EXECUTE RPCs; authenticated cannot update `users.is_admin`; public cannot INSERT `transactions`.
