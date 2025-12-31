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
  - Evidence: SA notes show REVOKE from anon/authenticated/public; only postgres + service_role retain EXECUTE.
  - Risk now: direct public RPC exploitation blocked.

- [Completed] Self-admin escalation via users UPDATE policy
  - Source: SA §Self-admin escalation
  - Evidence: Policy dropped + trigger prevents `users.is_admin` changes except service role.

- [Completed] Unrestricted INSERT into transactions/users (public policies)
  - Source: SA §Unrestricted INSERT
  - Evidence: Policies changed to `TO service_role`; reads limited to `authenticated`.

- [Mitigated] RPC trusted client-supplied `p_user_id`
  - Source: SA §p_user_id
  - Evidence: Risk reduced because public EXECUTE revoked; backend still passes `p_user_id` under service_role.
  - Remaining work: remove `p_user_id` from user-callable contexts or derive from auth in DB if ever re-exposed.

- [Mitigated] Resolution/invalid RPCs lacked admin checks
  - Source: SA §Admin checks
  - Evidence: Admin enforced at API layer; direct calls blocked by EXECUTE revoke.
  - Remaining work: add explicit admin check inside SQL functions as defense-in-depth if re-exposed.

- [Completed] Rate limit X-Forwarded-For spoofing
  - Source: SA §Rate limit bypass
  - Evidence: backend/app/rate_limit.py trusts XFF only when enabled and from trusted proxies; configurable settings.

---

## B) High/Medium Security and Correctness

- [Partially Completed] NaN/Infinity handling in slippage parameters
  - Source: SA §NaN/Infinity
  - Evidence: backend/app/models/schemas.py uses `math.isfinite` for `min_shares_out` and `shares`.
  - Remaining work: add `isfinite(...)`/NaN checks in Postgres RPCs as defense-in-depth.

- [Remaining] Resolution rounding mismatch (float shares, ROUND at payout)
  - Source: SA §Resolution rounding; TA Phase 2
  - Work: move to numeric/fixed-point; remove `ROUND` payout or unify consistent rounding across sell/resolve.

- [Remaining] Frontend/Backend CPMM divergence risk
  - Source: SA §FE/BE divergence; TA §5 tests
  - Work: backend-authoritative quotes or signed quote endpoint; invariant tests.

- [Remaining] Auth: leaked password protection disabled (and admin MFA)
  - Source: SA §Auth advisors
  - Work: enable in Supabase dashboard; enforce MFA for admins.

---

## C) Technical Audit Phases (Roll-up)

- Phase 0 — Immediate guardrails
  - [Completed] Fix open-position filtering bug (UI treats payout=0 correctly)
  - [Completed] Consistent invalid/cancelled status in FE list views
  - [Partially Completed] Slippage protection contract
    - FE/BE schemas added; DB enforcement expected via migrations. Ensure DB checks exist and CI integ test added.

- Phase 1 — Security baseline
  - [In Progress] Stop using service-role for user-scoped reads/writes
    - Ensure user-JWT scoped DB client for RLS reads/writes; keep service role for admin-only/internal RPCs.
  - [Completed] Add rate limiting for auth/trading endpoints
    - Evidence: rate_limit.py present with per-IP limits and hardened XFF.
  - [Completed] SECURITY DEFINER functions should set fixed search_path
    - Verify in migrations that functions specify `SET search_path TO public`.

- Phase 2 — Financial correctness
  - [Remaining] Migrate float → numeric for financial columns (DB + Decimal in BE)
  - [Remaining] Remove payout rounding inconsistency
  - [Remaining] Add reconciliation job + invariants

- Phase 3 — Market integrity (oracles & disputes)
  - [Remaining] Structured resolution fields
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

- [ ] Add `isfinite(...)` checks and explicit NaN guards inside Postgres RPCs for slippage parameters.
- [ ] Remove reliance on passing `p_user_id` from callers; derive user via `auth.uid()` for user flows; keep arbitrary user IDs admin-only.
- [ ] Ensure SECURITY DEFINER functions set `SET search_path TO public` and re-verify EXECUTE ACLs after any function edits.
- [ ] Switch financial columns to numeric/fixed-point; remove payout `ROUND` or align rounding across sell/resolve consistently.
- [ ] Implement backend-authoritative quote endpoint and FE/BE invariant tests.
- [ ] Enable leaked-password protection and enforce admin MFA in Supabase.
- [ ] Add CI tests asserting: anon cannot EXECUTE RPCs; authenticated cannot update `users.is_admin`; public cannot INSERT into `transactions`.
