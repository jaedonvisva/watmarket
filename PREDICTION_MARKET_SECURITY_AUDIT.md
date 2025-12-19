# Professional Security Audit — WatMarket (CPMM Prediction Market)

This audit uses **repo inspection + live Supabase schema/policy inspection + live attacker RPC calls**. Findings below are **realistic, high-impact**, and in several cases **launch-blocking**.

---

## [PUBLIC EXECUTE ON SECURITY DEFINER RPCs → Remote Trading/Resolution Without Auth]
Category: Authentication & Authorization / API & Backend Security  
Severity: **Critical**  

**Status (2025-12-19): Completed**

**Notes:**
- Applied Supabase migration `launch_blocking_security_fixes` on project `edaaoxnxopywyrnoqyse`.
- `REVOKE EXECUTE` from `anon`, `authenticated`, and `public` for:
  - `place_bet_atomic(uuid,uuid,text,integer,double precision)`
  - `sell_shares_atomic(uuid,uuid,text,double precision,double precision)`
  - `resolve_line_atomic(uuid,text)`
  - `resolve_line_invalid_atomic(uuid,uuid)`
- Verified via `pg_proc.proacl` that only `postgres` and `service_role` retain EXECUTE.

Exploit Description:  
All core “atomic” RPCs are `SECURITY DEFINER` **and executable by `anon` and `authenticated`** (function ACL includes `anon=X`, `authenticated=X`). This means *anyone with your public anon key* can call:

- `place_bet_atomic(...)`
- `sell_shares_atomic(...)`
- `resolve_line_atomic(...)`
- `resolve_line_invalid_atomic(...)`

These RPCs bypass RLS by design (run as function owner), and they do **not** verify caller identity/role internally.

Step-by-step attack:
1. Attacker obtains Supabase URL + anon key (public by design; also found in repo `.env` in this workspace).
2. Attacker calls `POST /rest/v1/rpc/resolve_line_atomic` directly from anywhere (no JWT) using `Authorization: Bearer <anon_key>`.
3. If attacker knows a `line_id`, they can resolve markets arbitrarily and trigger payouts/refunds.

Tools used:
- **supabase-mcp**: inspected `pg_proc.proacl` showing `anon` has EXECUTE on these RPCs.
- **mcp-playwright**: successfully invoked `place_bet_atomic` from an unauthenticated context (got real app error `User not found`, proving the call reached the function and executed logic).

Impact:
- **Total market integrity loss** (anyone can resolve/invalidate markets).
- **Funds/GOOS integrity loss** (payout/refund minting can be triggered).
- **Catastrophic reputation and economic failure** (markets become meaningless).

How to detect:
- Query Postgres for function privileges and monitor RPC endpoint access logs.
- Look for unexpected `lines.resolved=true` transitions with no corresponding backend admin action.

Concrete mitigation:
- **Immediate**: revoke public execution:
  - `REVOKE EXECUTE ON FUNCTION ... FROM anon, authenticated, public;`
- Replace with one of:
  - **Option A (recommended)**: only allow execution to a dedicated Postgres role used by backend (service role via API server) and keep the RPCs internal.
  - **Option B**: keep callable by `authenticated`, but enforce identity inside RPC:
    - Require `auth.uid()` and **remove `p_user_id` parameter** (derive user from `auth.uid()`).
    - For admin-only RPCs (`resolve_*`), require `EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin)` inside the function, and raise if not.
- Add a hard “deny by default” policy: if `auth.uid()` is null, reject.

---

## [SELF-ADMIN ESCALATION VIA USERS UPDATE POLICY]
Category: Authentication & Authorization / RLS bypass vectors  
Severity: **Critical**  

**Status (2025-12-19): Completed**

**Notes:**
- Dropped the `users` UPDATE policy (`"Users can update own profile"`) in Supabase to eliminate self-service updates of sensitive columns.
- Added a defense-in-depth trigger `trg_prevent_users_is_admin_update` that blocks changes to `users.is_admin` unless the caller is `service_role` (or trusted DB roles in SQL editor/migrations).
- Result: direct REST `PATCH /rest/v1/users?id=eq.<my_uid>` cannot escalate admin.

Exploit Description:  
RLS policy on `users` allows “Users can update own profile” with `qual: id = auth.uid()`. There is **no column-level restriction**, so a user can update **`is_admin`** and potentially other sensitive fields.

Step-by-step attack:
1. Attacker logs in normally.
2. Calls Supabase REST:
   - `PATCH /rest/v1/users?id=eq.<my_uid>` with body `{ "is_admin": true }`.
3. Now attacker passes backend admin guards (`get_current_admin` checks `current_user.is_admin`), gaining:
   - market creation
   - resolution/invalidation endpoints
   - admin-only data endpoints

Tools used:
- **supabase-mcp**: enumerated RLS policies on `users` and confirmed `UPDATE` policy lacks `WITH CHECK` column restrictions.

Impact:
- **Full privilege escalation to admin**.
- Secondary impacts:
  - arbitrary market resolution + refunds
  - forced invalidations (griefing + balance manipulation)
  - access to all user data exposed to admins (email lists, etc.)

How to detect:
- Alert on `users.is_admin` changes, especially self-service changes.
- Create an audit trigger logging `OLD.is_admin != NEW.is_admin`.

Concrete mitigation:
- **Split profile vs roles**:
  - Remove `is_admin` from user-editable table or make it immutable.
- Add RLS `WITH CHECK` to restrict updates to safe columns only (or deny updates and use RPC).
- Use Postgres triggers to block `is_admin` changes unless made by service role/admin-only RPC.

---

## [UNRESTRICTED INSERT INTO TRANSACTIONS / USERS (“SERVICE ROLE CAN INSERT” BUT APPLIES TO PUBLIC)]
Category: Ledger & Accounting Integrity / RLS  
Severity: **Critical**  

**Status (2025-12-19): Completed**

**Notes:**
- Updated RLS policy role bindings in Supabase:
  - `transactions` INSERT policy (`"Service role can insert transactions"`) changed to `TO service_role`.
  - `users` INSERT policy (`"Service role can insert users"`) changed to `TO service_role`.
  - Read policies for both tables changed to `TO authenticated`.
- Result: public roles can no longer forge ledger rows or insert arbitrary users.

Exploit Description:  
Policies show:
- `transactions`: “Service role can insert transactions” with `roles={public}` and `with_check=true`.
- `users`: “Service role can insert users” with `roles={public}` and `with_check=true`.

That is effectively **world-writable** for inserts (depending on how roles map in your Supabase config, but with `{public}` it’s extremely dangerous).

Step-by-step attack (ledger forgery):
1. Attacker inserts arbitrary `transactions` rows crediting themselves:
   - `amount: +1000000`, `type: 'payout'`
2. If any downstream system treats transactions as authoritative (portfolio, auditing, admin dashboards), attacker can:
   - spoof profit
   - potentially trigger reconciliation bugs / refunds / payouts incorrectly

Tools used:
- **supabase-mcp**: enumerated `pg_policies` showing permissive insert policies.

Impact:
- **Ledger integrity collapse**; impossible to trust accounting.
- Potential balance drift if any process later “replays” transactions.

How to detect:
- Audit: any transaction inserts not originating from backend service role / known RPC.
- Add DB trigger requiring inserts come from `auth.role()='service_role'` (or `current_setting('request.jwt.claim.role', true)` checks).

Concrete mitigation:
- Replace these policies with:
  - `TO service_role` (not `{public}`)
  - and/or require `auth.role() = 'service_role'`
- For transactions, only allow inserts via vetted RPCs; deny direct table insert for public roles.

---

## [RPC TRUSTS CLIENT-SUPPLIED p_user_id → Trading on Behalf of Others]
Category: Authentication & Authorization  
Severity: **Critical**  

**Status (2025-12-19): Mitigated**

**Notes:**
- This is no longer externally exploitable via direct Supabase RPC calls because EXECUTE was revoked from `anon`/`authenticated`.
- The backend still passes `p_user_id` to the RPC while executing with `service_role`.
- Remaining risk is now primarily: service-role leakage or backend auth bugs.

Exploit Description:  
`place_bet_atomic` / `sell_shares_atomic` take `p_user_id` and do not tie it to the caller. With public execute, an attacker can trade using any `user_id` they can learn/guess.

Step-by-step attack:
1. Attacker obtains a victim `user_id` (easy if ever leaked via logs, admin endpoint, or client storage compromise).
2. Calls `place_bet_atomic(p_user_id=victim, ...)` to spend victim GOOS, manipulate markets, or grief.
3. Calls `sell_shares_atomic(p_user_id=victim, ...)` to liquidate victim positions (if shares exist).

Tools used:
- **supabase-mcp**: inspected function definitions showing `p_user_id` is used directly.
- **mcp-playwright**: executed RPC without auth, proving feasibility of direct calls.

Impact:
- **Account balance theft / griefing** and market manipulation.

How to detect:
- Alert on trades where request JWT user != affected `p_user_id` (once you tie identity to auth).
- For now: alert on `p_user_id` that does not match backend-authenticated user on the FastAPI layer.

Concrete mitigation:
- Remove `p_user_id` from user-callable RPCs.
- In function: `v_user_id := auth.uid()` and enforce not null.
- Only allow admin/service role to pass arbitrary user IDs.

---

## [MARKET RESOLUTION/INVALIDATION RPCs HAVE NO ADMIN CHECK]
Category: Market Resolution & Payouts / Authorization  
Severity: **Critical**  

**Status (2025-12-19): Mitigated**

**Notes:**
- Direct execution by `anon`/`authenticated` is blocked by revoked EXECUTE privileges.
- Admin-only routing is enforced at the API layer (`get_current_admin`).
- Defense-in-depth improvement still recommended: add an explicit admin check inside the SQL functions if you ever re-expose execution to `authenticated`.

Exploit Description:  
`resolve_line_atomic` and `resolve_line_invalid_atomic` only lock rows and check `resolved`—they do **not** check admin privileges.

Step-by-step attack:
1. Attacker calls resolution RPC directly, selecting the favorable outcome for themselves.
2. Payouts are credited via `UPDATE users SET karma_balance = karma_balance + v_payout`.

Tools used:
- **supabase-mcp**: pulled function body for `resolve_line_atomic`.

Impact:
- **Direct minting** of GOOS to attacker via forced resolution.
- **Total loss of market correctness**.

How to detect:
- Monitor `lines` updates; any resolution not accompanied by an authenticated admin request should page.

Concrete mitigation:
- Inside function, add:
  - `IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin) THEN RAISE EXCEPTION ...; END IF;`
- Revoke EXECUTE from `anon` and most roles as described above.

---

## [NaN / Infinity Handling Risk in Slippage Parameters (Potential Slippage Bypass)]
Category: Trade Execution & Slippage / Backend validation  
Severity: **High**  

**Status (2025-12-19): Partially Completed**

**Notes:**
- Backend now rejects non-finite floats:
  - `BetCreate.min_shares_out` must be finite (`math.isfinite`).
  - `SellSharesRequest.shares` must be finite (`math.isfinite`).
- Direct public RPC execution was revoked, reducing exposure.
- Still recommended (defense-in-depth): add `isfinite(...)` checks inside the Postgres RPCs for `p_min_shares_out` and `p_min_amount_out`.

Exploit Description:  
`place_bet_atomic` checks `p_min_shares_out <= 0` and later `v_shares < p_min_shares_out`. In floating-point semantics, `NaN` comparisons can behave unexpectedly (often `FALSE`), which can neutralize protections if `NaN` reaches Postgres as a real float.

I attempted to pass `"NaN"` as JSON for `p_min_shares_out` and the function proceeded far enough to fail on `"Line not found"`, which indicates the input was accepted by the RPC endpoint and did not fail early on JSON parsing. (This is a **red flag**, even though the transaction did not execute due to invalid line.)

Step-by-step attack (if NaN reaches float8):
1. Send `p_min_shares_out = NaN`.
2. `p_min_shares_out <= 0` evaluates false → passes.
3. `v_shares < NaN` evaluates false → passes.
4. Trade executes without a meaningful min-out bound.

Tools used:
- **mcp-playwright**: sent `"NaN"` to `place_bet_atomic` (response reached `"Line not found"`, indicating the function ran).

Impact:
- Slippage protection can be bypassed, enabling MEV-style stale-quote attacks / user harm.

How to detect:
- Log and reject any non-finite slippage parameters at API and DB levels.
- Add DB check `p_min_shares_out = p_min_shares_out` (NaN check) and `isfinite(p_min_shares_out)`.

Concrete mitigation:
- In RPC: enforce `isfinite(p_min_shares_out)` and `isfinite(p_min_amount_out)`; reject NaN/Infinity.
- In FastAPI: validate `math.isfinite(...)` for all floats before calling RPC.

---

## [RATE LIMIT BYPASS VIA X-Forwarded-For SPOOFING]
Category: API & Backend Security / Operational  
Severity: **High**  

**Status (2025-12-19): Completed**

**Notes:**
- Hardened `backend/app/rate_limit.py` to only trust `X-Forwarded-For` when explicitly enabled and the request comes from a trusted proxy IP.
- Added settings to `backend/app/config.py`:
  - `trust_x_forwarded_for` (default `False`)
  - `trusted_proxy_ips` (default empty)

Exploit Description:  
Rate limit key function trusts `X-Forwarded-For` directly. An attacker can rotate fake IPs per request to bypass limits.

Step-by-step attack:
1. Send requests with `X-Forwarded-For: 1.2.3.4`, then `5.6.7.8`, etc.
2. Each request gets a different rate-limit bucket.

Tools used:
- **code inspection** (`backend/app/rate_limit.py`).

Impact:
- Defeats anti-abuse controls on trading/login/register.
- Enables high-frequency manipulation and brute force.

How to detect:
- Compare actual source IP at ingress (load balancer) vs header values; alert on anomalies.

Concrete mitigation:
- Only trust `X-Forwarded-For` if you are behind a trusted proxy and you explicitly configure trusted proxy headers.
- Use an ingress-controlled header (or `request.client.host`) and configure your reverse proxy to strip user-supplied XFF.

---

## [RESOLUTION ROUNDING MISMATCH: BUY FLOAT SHARES, PAYOUT ROUND(shares)]
Category: CPMM Math & Market Logic  
Severity: **Medium**  

**Status (2025-12-19): Remaining**

**Notes:**
- This is an economic/correctness issue rather than a pure auth/RLS issue.
- Fix requires choosing consistent rounding semantics (and ideally moving away from float-based accounting).

Exploit Description:  
Bets store `shares` as float8. On resolution, payout is `ROUND(v_bet.shares)::integer`. This creates rounding boundaries where users can potentially gain/lose up to ~0.5 GOOS per bet depending on fractional shares.

Numeric exploit example:
- Suppose user buys and ends with `shares = 10.49`. They get payout `ROUND(10.49)=10`.
- If they can instead structure trades to get `shares = 10.50`, payout becomes `11`.
- The delta is **1 GOOS** for only **0.01 shares** difference (which might be achievable via splitting trades / tuning stake sizes).

Tools used:
- **supabase-mcp**: inspected `resolve_line_atomic` function.
- **repo inspection**: shares are float computations.

Impact:
- Potential “micro-arb” farming via trade splitting around rounding thresholds.
- Ledger / payout expectations become inconsistent with “1 share = 1 GOOS” mental model.

How to detect:
- Analyze distribution of fractional shares near `.5` at resolution time.
- Alert on accounts with many tiny bets that cluster around rounding boundaries.

Concrete mitigation:
- Use integer share accounting (scaled fixed-point) or:
  - store shares as `numeric` with controlled scale,
  - and define payout as `FLOOR(shares)` consistently with sell rounding (or vice versa), but **be consistent** across sell + resolution + UI.
- Add minimum bet sizes / fees to suppress rounding farming.

---

## [FRONTEND/BE CALCULATION DIVERGENCE RISK (SELL LOGIC DIFFERS)]
Category: Frontend Trust & UX Attacks / CPMM  
Severity: **Medium**  

**Status (2025-12-19): Remaining**

**Notes:**
- Recommended approach: make backend authoritative for quotes (add a quote endpoint / signed quote) so FE cannot drift.
- Add invariant tests comparing FE estimates vs BE execution over randomized pool states.

Exploit Description:  
Frontend estimates sell value using “buy-opposite” method; backend sell RPC uses a quadratic direct formula then floors. If there are subtle divergences (float precision, rounding, edge cases), an attacker can intentionally craft trades where UI shows safe min-out but backend executes differently (or vice versa), causing unexpected fills or DoS.

Tools used:
- **repo inspection** (`frontend/src/utils/cpmm.ts`, backend SQL + python odds).

Impact:
- User-harm via unexpected reverts or fills.
- Increased surface for “stale quote” exploitation.

How to detect:
- Invariant test: compare FE estimate and BE execution across randomized pool states and trade sizes.

Concrete mitigation:
- Make backend authoritative; have frontend request a signed quote or call a “quote endpoint” that returns the min-out bound computed server-side.
- Use `numeric` with deterministic rounding in DB.

---

## [AUTH: Leaked Password Protection Disabled]
Category: Authentication  
Severity: **Medium**  

**Status (2025-12-19): Remaining**

**Notes:**
- Requires Supabase Auth configuration change (dashboard): enable leaked password protection.
- Recommended: enforce MFA for admins.

Exploit Description:  
Supabase advisor warns leaked password protection is disabled. This increases account takeover risk.

Tools used:
- **supabase-mcp** `get_advisors(security)`.

Impact:
- Higher ATO probability, which becomes catastrophic given admin escalation and ledger weaknesses.

How to detect:
- Monitor suspicious auth events, repeated login attempts, unusual IP/device.

Concrete mitigation:
- Enable Supabase leaked password protection.
- Add MFA for admins.

---

# ✅ Top 10 Highest-Risk Issues (Launch-Blocking First)

1. **Public EXECUTE on SECURITY DEFINER RPCs (trade + resolve + invalidate)**  
2. **Self-admin escalation via `users` UPDATE policy (no column restriction)**  
3. **Unrestricted INSERT into `transactions` (and possibly `users`) via `{public}` policies**  
4. **RPC trusts client-supplied `p_user_id` (trade on behalf of others)**  
5. **Resolution/Invalidation RPCs lack admin checks**  
6. **X-Forwarded-For spoofable rate limiting**  
7. **NaN/Infinity slippage parameter bypass risk**  
8. **Float share accounting + rounding at payout enables threshold farming**  
9. **Frontend vs backend CPMM calculation divergence / precision mismatch**  
10. **Auth leaked-password protection disabled**

---

# 🧪 Required Tests Before Launch (Concrete, Non-Optional)

- **RLS & Privilege Tests**
  - Verify non-admin cannot set `users.is_admin=true` (direct REST patch must fail).
  - Verify `anon` cannot call any RPC that mutates state.
  - Verify `authenticated` cannot call `resolve_*` unless admin.
  - Verify `transactions` cannot be inserted directly by public roles.

- **Invariant / Ledger Tests**
  - Property tests: for random sequences of buys/sells, ensure:
    - `users.karma_balance >= 0` always
    - `sum(transactions.amount)` reconciles to balance deltas
    - `bets.shares >= 0`
  - Add a reconciliation job to recompute balances from ledger and compare.

- **CPMM Math Tests**
  - FE quote vs BE execution within tolerance for randomized pool states.
  - Edge cases:
    - tiny pools
    - huge stake
    - near-close time
    - repeated sells reducing multiple bets FIFO

- **Race / Double-submit Tests**
  - Multi-tab concurrent sells and buys against same line and same position.
  - Confirm DB locks prevent double-spend of shares and negative pools.
  - Confirm idempotency: repeated request with same client id cannot double-execute.

- **Abuse Tests**
  - Spoof XFF and ensure rate limit still binds to real client.
  - High-frequency requests with many accounts.

---

# 🛡️ Security Assumptions Being Made (Must Be Explicit)

- **Unacceptable assumption**: “No one will call Supabase RPC endpoints directly.”  
  Attackers *will*; tools + anon keys make it trivial.
- **Unacceptable assumption**: “RLS policies labeled ‘service role’ are safe.”  
  The DB enforces only what policies actually say.
- **Unacceptable assumption**: “Frontend slippage validation is enough.”  
  Frontend is attacker-controlled.

---

# ⚠️ Risks Acceptable vs Unacceptable

## Risks Acceptable (if fixed elsewhere)
- Minor rounding differences if bounded and consistent, with fees/min sizes.

## Risks Unacceptable (Block launch)
- Any path to:
  - unauthorized market resolution/invalidation
  - admin privilege escalation
  - direct transaction/ledger forgery
  - RPC execution without strict auth binding

---

# ✅ Remediation Summary (as of 2025-12-19)

## Completed
- Public EXECUTE on SECURITY DEFINER RPCs revoked (RPCs now only executable by `service_role`).
- Self-admin escalation via `users` UPDATE policy fixed (policy dropped + trigger prevents `is_admin` changes).
- World-writable INSERT policies fixed.
- X-Forwarded-For rate-limit spoofing fixed in backend.

## Mitigated
- RPC trust of client-supplied `p_user_id` is mitigated by revoking public RPC execution (still recommended to remove/derive from auth if you ever re-expose RPCs).
- Resolution RPC missing admin checks is mitigated by revoking public RPC execution (still recommended to add internal admin checks for defense-in-depth).

## Remaining
- Float rounding mismatch at resolution.
- FE/BE CPMM divergence hardening (server-authoritative quotes + property tests).
- Supabase Auth leaked-password protection (and admin MFA).

## Recommended next steps
- Add `isfinite(...)` checks inside `place_bet_atomic` and `sell_shares_atomic` for defense-in-depth.
- Add an automated regression test/script to assert:
  - `anon` cannot EXECUTE RPCs
  - `authenticated` cannot change `users.is_admin`
  - `public` cannot INSERT into `transactions`.
