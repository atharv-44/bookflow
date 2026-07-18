# BookFlow — High-Concurrency Ticket Reservation Platform

A seat-booking backend focused on solving the double-booking race
condition properly — not another BookMyShow UI clone.

**Read [`DESIGN_DECISIONS.md`](./DESIGN_DECISIONS.md) before your
interviews.** It has the exact reasoning behind every hard decision
in this project, written to match what we discussed step by step.

## Core loop (what's built)
- Signup / login (JWT auth)
- Create a show (auto-generates a seat grid)
- List shows, view seat map
- Hold a seat (atomic, race-condition-safe, 2-minute expiry)
- Release a held seat
- Confirm booking (simulated payment + transactional seat/booking write)
- View your booking history

## Not built yet (intentional — see design doc "Known gaps")
QR codes, email confirmation, and an admin dashboard are left for
later polish, once the core loop is fully understood and solid.

## Running locally

You'll need MongoDB running locally (or a free MongoDB Atlas cluster).

### Server
```bash
cd server
npm install
cp .env.example .env   # edit MONGO_URI / JWT_SECRET if needed
npm run dev             # http://localhost:5000
```

### Client
```bash
cd client
npm install
npm run dev              # http://localhost:5173
```

### Seed a show to test with
```bash
curl -X POST http://localhost:5000/api/shows \
  -H "Content-Type: application/json" \
  -d '{"title":"Inception","venue":"PVR Phoenix","startTime":"2026-08-01T18:00:00Z","rows":5,"seatsPerRow":8,"price":250}'
```

## Testing the race condition yourself (do this — it's the whole point)
1. Open the client in two different browser windows, sign up as two
   different users.
2. Both select the same show.
3. Click the SAME seat in both windows as close together as you can.
4. One will succeed (turns blue = held by you), the other will get
   "Seat is no longer available" — that's the atomic update working.
5. Wait 2 minutes without confirming — watch the seat return to free
   (green) on the next poll, since the hold expired.

Being able to demo this live, and explain what's happening, is worth
more in an interview than any amount of polish.

## API Reference

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | No | Create account |
| POST | `/api/auth/login` | No | Log in |
| POST | `/api/shows` | No | Create a show + seat grid |
| GET | `/api/shows` | No | List shows |
| GET | `/api/shows/:id/seats` | No | Get seat map for a show |
| POST | `/api/seats/:seatId/hold` | Yes | Atomically hold a seat |
| POST | `/api/seats/:seatId/release` | Yes | Release your own held seat |
| POST | `/api/bookings/confirm` | Yes | Pay + confirm booking (transaction) |
| GET | `/api/bookings/my` | Yes | Your booking history |

## Next steps to extend (good v2 talking points)
1. Replace client polling with WebSockets for instant seat updates.
2. Add a proactive cleanup job (cron or change stream) for expired holds.
3. Add QR ticket generation and email confirmation.
4. Add an admin role for show management.
5. Add a saga/compensating-transaction pattern for payment edge cases.
