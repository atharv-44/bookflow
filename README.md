# BookFlow

A full-stack movie/event seat booking application built as a Computer Engineering placement project. BookFlow lets users browse shows, hold and book seats in real time, and view their booking history — while an admin panel lets privileged users manage the show catalogue.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | Node.js, Express |
| Database | MongoDB Atlas (Mongoose ODM) |
| Auth | JWT (jsonwebtoken), bcryptjs |
| Real-Time | Socket.IO (WebSockets) |
| Testing | Jest, Supertest, mongodb-memory-server |

## Getting Started

```bash
# 1. Clone and install
git clone <repo-url>
cd bookflow

cd server && npm install
cd ../client && npm install

# 2. Configure environment
# Create server/.env with:
#   MONGO_URI=<your MongoDB Atlas connection string>
#   JWT_SECRET=<a long random secret>

# 3. Run
cd server && node index.js        # Backend on :5000
cd client && npm run dev          # Frontend on :5173
```

## Architecture Highlights

### (a) Atomic Seat Locking — Preventing Race Conditions

The core booking problem: two users click the same seat at the same instant. A naive read-then-write implementation has a window between the "is the seat free?" check and the "mark it taken" write — which can be exploited under concurrent load.

BookFlow solves this with a **single atomic `findOneAndUpdate`** in MongoDB:

```js
Seat.findOneAndUpdate(
  { _id: seatId, $or: [{ status: "free" }, { status: "held", heldUntil: { $lt: now } }] },
  { $set: { status: "held", heldBy: userId, heldUntil } },
  { new: true }
)
```

MongoDB executes this as one indivisible operation. If two requests race, exactly one gets a matching document back; the other gets `null` and returns a `409 Conflict`. This is verified by an automated concurrency test (`tests/concurrency.test.js`) that fires two simultaneous HTTP requests via `Promise.all()` and asserts the `[200, 409]` outcome.

### (b) RBAC with DB-Verified Admin Checks

Role-based access control is implemented across three layers:

1. **Database**: `User` schema has a `role` field (`"user"` | `"admin"`, default `"user"`).
2. **JWT**: Role is embedded in the signed token so the frontend can show/hide the Admin tab without an extra round-trip.
3. **Middleware**: `requireAdmin` fetches the user **fresh from the database** on every admin request — it does not trust the JWT's cached role. This means a demoted admin is blocked with `403 Forbidden` on their very next request, with no need to wait for token expiry.

Admin promotion is done out-of-band via a CLI script (`scripts/promoteAdmin.js`), not through an API route — so no client can self-promote by injecting `role` into a request body.

### (c) Real-Time Seat Sync via WebSockets

Socket.IO pushes seat state changes to all clients watching the same show:

1. When a user opens a seat grid, the frontend emits `join_show(showId)` to subscribe to a per-show room.
2. After every atomic hold, release, or confirmed booking, the backend emits `seats_updated` to that room.
3. All subscribed clients immediately re-fetch seat state — no polling required.

This replaces a previous 3-second `setInterval` and ensures seat availability is always current across multiple simultaneous users.

## Running Tests

```bash
cd server
set NODE_OPTIONS=--experimental-vm-modules  # Windows (use export on Mac/Linux)
npx jest
```

Expected output:
```
PASS tests/concurrency.test.js
  Concurrency - Atomic Seat Booking
    ✓ should prevent double-booking when two users try to hold the same seat at the same time

Tests: 1 passed, 1 total
```

## Admin Access

```bash
cd server
node scripts/promoteAdmin.js your@email.com
# → Success! User your@email.com is now an admin.
```

Log out and log back in to receive a fresh JWT with the updated role. The **Admin Dashboard** tab will appear in the navigation bar, allowing you to create new shows with a custom seat grid.
