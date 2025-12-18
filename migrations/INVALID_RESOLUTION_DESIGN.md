# INVALID Resolution Design Document

## Overview

This document describes the design for **INVALID** market resolution—a third terminal state alongside YES and NO that cancels a market and refunds users their net investment.

---

## Accounting Logic

### Core Formula

```
refund_per_user = MAX(total_bought - total_sold, 0)
```

Where:
- `total_bought` = SUM of all `stake` values from `bets` table for this user+line
- `total_sold` = SUM of all `amount` values from `transactions` where `type='sell'` for this user+line

### Why This Works

1. **User buys 100 GOOS worth of shares** → `total_bought = 100`
2. **User sells some for 40 GOOS** → `total_sold = 40`
3. **Market invalidated** → `refund = 100 - 40 = 60 GOOS`

The user already received 40 GOOS back when they sold, so they only need 60 more to be made whole.

### Edge Cases

| Scenario | total_bought | total_sold | refund | Notes |
|----------|--------------|------------|--------|-------|
| Never sold | 100 | 0 | 100 | Full refund |
| Partial sell | 100 | 40 | 60 | Already got 40 back |
| Sold everything at profit | 100 | 120 | 0 | User profited, no refund (clamped to 0) |
| Sold everything at loss | 100 | 80 | 20 | Lost 20 in sells, get 20 back |
| Multiple buys | 50+50 | 30 | 70 | Aggregate all buys |
| Never traded | 0 | 0 | 0 | Nothing to refund |
| Sold more than bought (exploit?) | 50 | 100 | 0 | Impossible in valid system, but clamped anyway |

### Rounding Policy

- All GOOS values are integers
- `stake` in `bets` is already integer
- Sell `amount` in `transactions` is stored as integer (rounded at sell time)
- Refund is computed as integer subtraction → no rounding needed
- If schema stores floats, cast to integer at refund time: `refund_amount::integer`

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    resolve_line_invalid_atomic                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. LOCK line row (FOR UPDATE)                                   │
│     └── Prevents concurrent trades/resolutions                   │
│                                                                  │
│  2. VALIDATE line not already resolved                           │
│     └── Raises exception if resolved=true                        │
│                                                                  │
│  3. UPDATE line: resolved=true, correct_outcome='invalid'        │
│     └── Halts all trading immediately                            │
│                                                                  │
│  4. FOR EACH user with positions:                                │
│     ├── Calculate: total_bought (from bets)                      │
│     ├── Calculate: total_sold (from transactions)                │
│     ├── Calculate: refund = MAX(bought - sold, 0)                │
│     ├── UPDATE users.karma_balance += refund                     │
│     └── INSERT transactions (type='refund')                      │
│                                                                  │
│  5. UPDATE line: yes_pool=0, no_pool=0                           │
│     └── Pools become unusable                                    │
│                                                                  │
│  6. RETURN summary JSON                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Atomicity Guarantees

The entire function runs in a **single database transaction**:

1. **Row-level lock** on `lines` via `FOR UPDATE` prevents:
   - Concurrent resolution attempts
   - New trades during resolution (they'd block on line lock)

2. **Implicit transaction** wraps all statements:
   - If any step fails, entire transaction rolls back
   - No partial refunds possible
   - Either all users get refunded or none do

3. **Consistent reads** within transaction:
   - All aggregations see the same snapshot of data
   - No phantom reads of new trades

---

## Schema Changes Summary

### `lines` table

| Column | Change | Type | Notes |
|--------|--------|------|-------|
| `correct_outcome` | Modified constraint | text | Now allows 'yes', 'no', 'invalid' |
| `resolved_at` | New column | timestamptz | When resolution occurred |
| `resolved_by` | New column | uuid | Which admin resolved |

### `transactions` table

| Column | Change | Type | Notes |
|--------|--------|------|-------|
| `type` | Modified constraint | text | Now allows 'refund' |
| `metadata` | New column | jsonb | Stores refund details |

### New Indexes

- `idx_transactions_line_refund` on `(reference_id, type)` for fast sell lookups
- `idx_bets_line_user` on `(line_id, user_id)` for fast buy aggregation

---

## API Changes

### New Endpoint

```
POST /lines/{line_id}/invalidate
Authorization: Bearer <admin_token>

Response 200:
{
  "line_id": "uuid",
  "correct_outcome": "invalid",
  "users_refunded": 5,
  "total_refunded": 1250,
  "resolved_at": "2025-12-17T20:00:00Z"
}
```

### Modified Schema

```python
# LineResolve now accepts 'invalid'
class LineResolve(BaseModel):
    correct_outcome: Literal["yes", "no", "invalid"]
```

Or keep separate endpoint for clarity (recommended).

---

## Frontend Changes

### Admin Dashboard

1. Add "Invalidate" button alongside YES/NO resolve buttons
2. Confirmation modal: "This will refund all users their net investment. Are you sure?"
3. Show result: "Market invalidated. 5 users refunded 1,250 GOOS total."

### Market Detail Page

1. Show "INVALID" badge when `correct_outcome === 'invalid'`
2. Display "Market was cancelled. Your investment was refunded." message
3. Disable trading panel (already handled by `resolved=true`)

### Portfolio Page

1. Handle `result: 'refunded'` state in trade history
2. Show refund transactions in activity feed

---

## Testing Checklist

- [ ] User with only buys gets full refund
- [ ] User with partial sells gets net refund
- [ ] User who sold at profit gets zero refund (not negative)
- [ ] User with no trades gets nothing
- [ ] Multiple users refunded correctly
- [ ] Transaction records created for each refund
- [ ] Line marked resolved with outcome='invalid'
- [ ] Pools zeroed after invalidation
- [ ] Cannot trade on invalidated market
- [ ] Cannot resolve already-resolved market
- [ ] Concurrent resolution attempts blocked
- [ ] Rollback on any failure (no partial refunds)

---

## Migration Execution Order

1. Run `001_invalid_resolution.sql` in Supabase SQL editor
2. Deploy backend changes (resolver service + routes)
3. Deploy frontend changes (admin UI + market display)
4. Test on a dummy market before using in production
