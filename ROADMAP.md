# WatMarket Feature Roadmap

This document tracks the future work for WatMarket, ordered from essential to experimental. It is meant to be read by humans and LLMs to understand what is planned next.

---

## Phase 1 — Stability, Safety, and Core Reliability

These are necessities to run a university-wide app.

### 1. Robust Moderation + Governance

Currently, only admins can create lines, but there is no richer moderation system.

Planned work:
- Line creation policies (who can create? currently only admins).
- Admin panel to:
  - Approve/reject new proposed markets.
  - Edit incorrect titles/descriptions.
  - Cancel a market before it resolves.
  - Temporarily suspend users.
- Report button on each line and each user bet/comment.
  - Pipe into a simple `reports` table.

Goals: prevent spam, malicious lines, personal attacks, or inappropriate markets.

### 2. Market Cancellation Handling

Right now, the system assumes every market resolves normally.

Planned work:
- Admin "Cancel Market" button.
- Payout logic on cancellation:
  - Refund all stakes 1:1.
- Mark line as cancelled (new field/state).
- Update frontend display for cancelled markets.

### 3. Odds History Recorder (Automated Cron)

Right now `price_history` only updates when somebody bets or views.

Planned work:
- Use Supabase scheduled functions (cron) or FastAPI background tasks to snapshot every X minutes:
  - `line_id`, `yes_probability`, `no_probability`, `timestamp`.

Goal: make charts smooth and trustworthy.

---

## Phase 2 — Improving the Market Experience

These are core UX features prediction markets are expected to have.

### 4. Commenting & Discussion Threads

On each market, users should be able to discuss why they think YES/NO.

Planned work:
- Comments on each line.
- Moderation tools:
  - Delete comments.
  - Soft-ban spammers.
- Tables to add:
  - `comments` (`id`, `line_id`, `user_id`, `content`, `created_at`).

### 5. Notifications

Planned work:
- Events to notify on:
  - Price moved significantly on a market you bet on.
  - Someone responded to your comment.
  - Market closed.
  - Market resolved.
- Simple solution:
  - `notifications` table + badge counter in UI.

### 6. Better Market Categories

Markets need organization.

Planned work:
- Categories such as:
  - Academics
  - Sports
  - Events
  - Pop culture
  - Program-specific (CS, Math, Econ, etc.)
- Tables:
  - `categories`
  - `lines_categories` (junction table).
- Frontend:
  - Filter by category.
  - Browse by category.

### 7. User Leaderboards

Planned work:
- Rank users by:
  - Total GOOSE.
  - Net profit.
  - Win rate.
  - Volume traded.

Goal: gamify usage and increase engagement.

### 8. Portfolio Analytics

Currently only positions + transactions are shown.

Planned work:
- Profit/Loss over time.
- Graph of net worth over time.
- Breakdown by category or outcome.

---

## Phase 3 — Scaling & Performance

For when the userbase grows.

### 9. Real-Time Updates

Right now the UI fetches after actions.

Planned work:
- Supabase Realtime subscriptions on:
  - `lines` table (yes/no stake updates).
  - `bets` table.
  - `price_history` table.

Outcome: instant updates for odds, charts, and order book so the UI feels alive.

### 10. Caching Layer

For heavy pages like markets list or price charts.

Planned work:
- Add Redis or Supabase WR/pgmq (or similar) to reduce load.
- Precompute active markets list.

---

## Phase 4 — Community & Social Layer

### 11. Follow Users / Follow Markets

Planned work:
- Users can follow other users.
- Users can follow markets.
- Users get a feed of updates based on follows.

### 12. Weekly Tournaments

Planned work:
- Weekly tournament mode:
  - Users start with same "tournament balance".
  - Trade in special tournament-only markets.
  - Leaderboard resets weekly.
  - Top N win cosmetic badges or unique profile flair.

Goal: drive recurring engagement.

### 13. Achievements / Badges

Examples:
- "Early Predictor" (bet within first 10 minutes).
- "Contrarian" (bet against 90% consensus).
- "Sharpshooter" (10 predictions in a row).

All cosmetic → safe for minors.

---

## Phase 5 — Monetization-Compatible / University Scale

Using virtual points (GOOS tokens, not real currency).

### 14. Multi-Campus Support

Planned work:
- Add:
  - `institutions` table.
  - `programs` table.
- Users belong to an institution + program.
- Markets become scoped:
  - Public to all campuses.
  - Program-specific.
  - Campus-specific.

### 15. Market Templates

Planned work:
- Allow admins to quickly create common recurring markets, e.g.:
  - "CS246 midterm average > 72%?"
  - "Warriors win next game?"
  - "Snow day next Monday?"

Goal: make the system easier to operate.

### 16. Public API

Planned work:
- Expose a public API so students can build bots:
  - Price fetching.
  - Auto-arbitrage bots.
  - Leaderboards.
  - Market creation proposals.
- Add:
  - Rate limiting.
  - API key management.

---

## Phase 6 — UX Polish

### 17. Market Search

Planned work:
- Search by:
  - Keywords.
  - Tags.
  - Categories.
- Add fuzzy search (e.g. pg_trgm).

### 18. Better Market Cards

Planned work:
- Add:
  - Implied probability sparkline.
  - "Hot" markets.
  - "Closing soon" section.
  - Newly created.
  - Trending (most volume).

### 19. Dark Mode

Planned work:
- Full dark mode theme (if not already primary).
- Toggle in UI.

---

## Phase 7 — Optional / Experimental

These are ambitious but cool.

### 20. Multi-Outcome Markets

Planned work:
- Move beyond binary (yes/no) to support:
  - Multiple choice.
  - Numeric range buckets (0–10, 10–20, etc.).
- Requires different math + pools.

### 21. Continuous Prediction Markets

Planned work:
- Metaculus-style continuous prediction markets:
  - Users predict probability directly.
  - Market aggregates via a proper scoring rule.
  - Not purely betting-based.

Note: this is a research-heavy direction, not required for a solid MVP.
