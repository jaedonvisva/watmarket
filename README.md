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

## API Reference

### Authentication

#### Register
```http
POST /users/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "karma_balance": 1000,
    "is_admin": false,
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

#### Login
```http
POST /users/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

#### Get Current User
```http
GET /users/me
Authorization: Bearer <token>
```

---

### Lines

#### Get All Lines
```http
GET /lines
Authorization: Bearer <token>
```

**Query params:**
- `resolved` (optional): `true` or `false`

**Response:**
```json
[
  {
    "id": "uuid",
    "title": "Will it rain tomorrow?",
    "description": "Based on local weather",
    "closes_at": "2024-12-31T23:59:59Z",
    "yes_stake": 500,
    "no_stake": 300,
    "resolved": false,
    "correct_outcome": null,
    "created_at": "2024-01-01T00:00:00Z",
    "odds": {
      "yes_probability": 0.6219,
      "no_probability": 0.3781,
      "yes_odds": 1.6078,
      "no_odds": 2.6447
    }
  }
]
```

#### Create Line (Admin)
```http
POST /lines
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "title": "Will the cafeteria serve pizza on Friday?",
  "description": "Main campus cafeteria only",
  "closes_at": "2024-12-20T12:00:00Z"
}
```

#### Resolve Line (Admin)
```http
POST /lines/{id}/resolve
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "correct_outcome": "yes"
}
```

**Response:**
```json
{
  "line_id": "uuid",
  "correct_outcome": "yes",
  "total_bets": 10,
  "winners": 6,
  "losers": 4,
  "total_winning_stake": 600,
  "total_losing_stake": 400,
  "payouts": [
    {
      "user_id": "uuid",
      "bet_id": "uuid",
      "original_stake": 100,
      "payout": 166
    }
  ]
}
```

---

### Bets

#### Place Bet
```http
POST /bets/place
Authorization: Bearer <token>
Content-Type: application/json

{
  "line_id": "uuid",
  "outcome": "yes",
  "stake": 100
}
```

**Response:**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "line_id": "uuid",
  "outcome": "yes",
  "stake": 100,
  "created_at": "2024-01-01T00:00:00Z",
  "potential_payout": 160.78
}
```

#### Get My Bets
```http
GET /bets/my
Authorization: Bearer <token>
```

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

## Making a User Admin

Run this SQL in Supabase SQL Editor:

```sql
UPDATE public.users 
SET is_admin = true 
WHERE email = 'admin@example.com';
```

---

## Project Structure

```
watmarket/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py           # FastAPI app
│   │   ├── config.py         # Settings
│   │   ├── database.py       # Supabase clients
│   │   ├── models/
│   │   │   └── schemas.py    # Pydantic models
│   │   ├── routers/
│   │   │   ├── users.py      # Auth endpoints
│   │   │   ├── lines.py      # Lines endpoints
│   │   │   └── bets.py       # Bets endpoints
│   │   └── services/
│   │       ├── auth.py       # Auth helpers
│   │       ├── odds.py       # Odds calculator
│   │       └── resolver.py   # Payout resolver
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts     # API client
│   │   ├── context/
│   │   │   └── AuthContext.tsx
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Register.tsx
│   │   │   ├── Lines.tsx
│   │   │   ├── LineDetail.tsx
│   │   │   ├── CreateLine.tsx
│   │   │   └── Dashboard.tsx
│   │   ├── App.tsx
│   │   └── App.css
│   └── .env.example
└── README.md
```

---

## Supabase Project Info

- **Project**: prediction-market
- **URL**: https://edaaoxnxopywyrnoqyse.supabase.co
- **Region**: us-east-2
