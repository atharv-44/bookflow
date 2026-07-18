# BookFlow — Complete Project Summary & Build Guide

**Purpose of this document:** a single reference covering everything
about this project — why it exists, what's built, how it works, what's
left, and how to talk about it in interviews. Use this alongside
`DESIGN_DECISIONS.md` (which is purely the interview-answer cheat
sheet) and `README.md` (which is purely setup instructions).

---

## 1. Why this project exists

You're a final-year Computer Engineering student preparing for SDE/
full-stack placements. The goal was to build a resume project that:

- Is **not** another CRUD app, social media clone, or AI-wrapper —
  those are overdone and don't differentiate you
- Uses a tech stack you already know (Node/Express/MongoDB/React) —
  no new frameworks or protocols to learn under time pressure
- Has **exactly one deep, well-known hard problem** at its core, so
  you can go deep instead of wide — depth beats a long feature list
  in interviews
- Maps to real, frequently-asked interview questions, so building it
  doubles as interview prep

**The chosen hard problem: preventing double-booking under concurrent
load.** This is a genuinely famous problem (asked in some form at
almost every company doing e-commerce, ticketing, ride-hailing, or
inventory systems) and it's fully solvable using concepts you can
learn properly in a short time: atomic database operations and
transactions — no networking/protocol knowledge required.

---

## 2. What BookFlow is

A backend-focused ticket/seat reservation platform — think of the
hardest backend problem inside something like BookMyShow or
Ticketmaster, isolated and built properly, without trying to be a full
UI clone of either.

**Explicitly not the goal:** feature parity with real ticketing
platforms, polished design, or a huge feature checklist. The goal is
one deeply-understood, well-engineered core loop.

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js + Express | Familiar, fast to build REST APIs |
| Database | MongoDB + Mongoose | Native atomic `findOneAndUpdate` + multi-document transactions solve both core problems without extra infra |
| Auth | JWT + bcrypt | Standard, stateless, simple to reason about |
| Frontend | React + Vite | Familiar, fast dev loop |
| Payment | Simulated (random success/fail) | Real payment gateway integration isn't the point of this project — the *handling* of success/failure is |

---

## 4. The four core concepts (in the order you learned them)

### 4.1 Race conditions
Two requests touching the same data at nearly the same instant, where
the outcome depends on timing rather than logic. Concretely: two users
trying to book the same seat within the same second. Without
protection, both can succeed, because a naive implementation checks
"is it free?" and writes "mark it booked" as two separate steps, with
a window in between where another request can sneak in.

### 4.2 Atomic check-and-update (the actual fix)
Instead of "read, then write" as two steps, use a single database
instruction: *"update this document only if it currently matches
condition X, and tell me whether the update happened."* MongoDB
guarantees this happens as one indivisible operation — no other
request can interleave. This is implemented via `Seat.findOneAndUpdate()`
in `routes/seats.js`. If two identical requests race, only one
actually matches and updates; the other gets `null` back.

### 4.3 Temporary seat holds with expiry
When a user selects a seat, it becomes "held" for 2 minutes (not
instantly booked) — mirrors real ticketing platforms. If they don't
complete payment in time, the seat must become available again.

**Key design decision:** expiry is enforced by re-checking at
write-time (`heldUntil: { $lt: now }` included in the same atomic
query that acquires a new hold), NOT via a MongoDB TTL index. TTL
indexes only sweep every ~60 seconds in the background — not precise
enough to close the exact race at the expiry boundary. Checking and
reclaiming expired holds inside the same atomic operation that
acquires a new one is both simpler and more correct.

### 4.4 Database transactions
Confirming a booking requires two related writes: marking seats
"booked" and creating the Booking record. These need to succeed or
fail **together** — if only one happened (e.g. a crash mid-request),
you'd get orphaned data (a booked seat with no booking record, or
vice versa). `mongoose.startSession()` + `session.withTransaction()`
in `routes/bookings.js` guarantees atomicity across both writes.

**Important nuance:** the simulated payment call happens BEFORE the
transaction starts, not inside it — because a transaction can only
roll back database writes, not an external payment gateway charge.

---

## 5. Full file structure (as currently built)

```
bookflow/
├── DESIGN_DECISIONS.md       # interview cheat sheet
├── README.md                  # setup instructions + API reference
├── PROJECT_SUMMARY.md         # this file
├── .gitignore
├── server/
│   ├── package.json
│   ├── .env.example
│   ├── index.js               # Express app entry, mounts all routes
│   ├── utils/
│   │   └── db.js              # MongoDB connection
│   ├── models/
│   │   ├── User.js            # name, email, passwordHash
│   │   ├── Show.js            # title, venue, startTime, rows, seatsPerRow, price
│   │   ├── Seat.js            # show ref, seatLabel, status, heldBy, heldUntil
│   │   └── Booking.js         # user ref, show ref, seats[], amount, paymentStatus
│   ├── middleware/
│   │   └── auth.js            # JWT verification middleware
│   └── routes/
│       ├── auth.js            # POST /signup, POST /login
│       ├── shows.js           # POST /, GET /, GET /:id/seats
│       ├── seats.js           # POST /:seatId/hold, POST /:seatId/release
│       └── bookings.js        # POST /confirm, GET /my
└── client/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        └── App.jsx            # auth forms, show list, seat grid, booking flow
```

---

## 6. API Reference

| Method | Route | Auth required | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | No | Create account, returns JWT |
| POST | `/api/auth/login` | No | Log in, returns JWT |
| POST | `/api/shows` | No (should be admin-only eventually) | Create a show, auto-generates its seat grid |
| GET | `/api/shows` | No | List all shows |
| GET | `/api/shows/:id/seats` | No | Get the full seat map for a show |
| POST | `/api/seats/:seatId/hold` | Yes | Atomically hold a seat (2-min expiry) |
| POST | `/api/seats/:seatId/release` | Yes | Release your own held seat early |
| POST | `/api/bookings/confirm` | Yes | Simulate payment + confirm booking (transaction) |
| GET | `/api/bookings/my` | Yes | Get your booking history |

---

## 7. Current status

**Built and verified (syntax-checked, dependencies installed, client
build-tested):**
- Full auth flow (signup/login with JWT + bcrypt)
- Show creation with auto-generated seat grid
- Atomic seat hold/release logic (the core race-condition fix)
- Booking confirmation with simulated payment + transaction
- Basic React client: auth forms, show list, clickable seat grid with
  live status polling, booking confirmation

**Also built (Phase 2, just added):**
- Booking history page in the client, with payment status badges
- Navigation bar (Shows / My Bookings / Logout) — no more re-login to move between views
- Loading states on every async action (shows, seats, bookings, auth submit, payment confirm)
- Client-side AND server-side input validation on signup (name length,
  email format, password length) — server-side is the real
  enforcement; client-side is just faster feedback

**Not yet built (see roadmap below):**
- QR ticket generation
- Email confirmation
- Admin dashboard / admin role
- Automated tests
- Deployment

---

## 8. Known gaps (be upfront about these in interviews — they show self-awareness, not weakness)

- No refund/compensation logic if a payment succeeds but a later
  step fails — a real system would need a saga pattern or
  compensating transaction, since DB transactions can't undo an
  external payment gateway charge.
- Seat-hold expiry is only checked reactively (when someone next
  tries to act on that seat), not proactively cleaned up. A cron job
  or MongoDB change stream could add proactive cleanup.
- No admin role yet — anyone can currently create a show via the API.
- Client polls every 3 seconds for seat updates instead of using
  WebSockets for instant push. This is a reasonable, honest "v2"
  answer if asked "what would you change."
- No automated tests yet (see roadmap — this is a real gap worth
  closing before placements, not just for interviews but because
  it's genuinely good practice).

---

## 9. Build roadmap (where we are, what's next)

### Phase 1 — Core loop running locally ✅ code complete, ⏳ pending your local run
Get MongoDB (Atlas or local) connected, run server + client, do the
two-browser-window double-booking test, confirm you understand and
can explain the race-condition fix.

### Phase 2 — Finish core loop UI ✅ done
- Booking history page in the client
- Better error/loading states
- Basic input validation polish (client + server)

### Phase 3 — Push to GitHub (next)
Clean, incremental commit history (not one giant commit) + a
polished top-level README with screenshots/GIF of the seat grid in action.

### Phase 4 — Deploy
- Server → Render or Railway (free tier)
- Database → MongoDB Atlas (free tier)
- Client → Vercel or Netlify
- Wire up environment variables between them

### Phase 5 — Polish (only if time remains before placements)
QR ticket generation, email confirmation, admin dashboard — in that
priority order, since QR/email are more visually impressive in a demo
than an admin panel.

### Phase 6 — Testing (recommended before calling it "done")
A few targeted tests are worth far more than broad coverage here:
- Unit test the atomic hold logic (mock two concurrent requests)
- Integration test the full confirm-booking flow, including a
  simulated payment failure path
This directly answers "how did you test it?" with a real answer
instead of "I clicked around manually."

---

## 10. Interview Q&A quick reference

*(Full reasoning for each lives in `DESIGN_DECISIONS.md` — this is
just the index so you know what's covered.)*

- How do you prevent double booking? → §4.2, atomic `findOneAndUpdate`
- Why did you use transactions? → §4.4
- What happens if payment fails? → §4.4, hold stays active for retry
- Why this database? → MongoDB's native atomic ops + transactions
- Why not a TTL index for hold expiry? → §4.3
- How would you scale it? → atomicity lives in the DB, not server
  memory, so horizontal scaling is just adding more Node instances
- What are the bottlenecks? → per-document write lock on a single
  seat under extreme contention (rare in practice — contention is
  per-seat, not global)
- What would you change in v2? → WebSockets instead of polling,
  proactive hold cleanup, admin role, automated tests

---

## 11. What to do right now

1. Get MongoDB connected (Atlas recommended) and run Phase 1 locally
2. Do the two-browser double-booking test
3. Come back and explain the race-condition fix in your own words
4. Once confirmed solid, we move to Phase 2 (booking history UI)
