# Design Decisions — BookFlow

This file is your interview cheat sheet. Every entry maps to something
we walked through in plain language before writing any code — reread
this until you can explain each point without notes.

## 1. How double-booking is prevented (the core concept)
Naive approach: "check if seat is free" then "mark it booked" as two
separate steps. Between those two steps, another request can sneak in
and see the seat as still free — that's the race condition.

Fix: `Seat.findOneAndUpdate()` in `routes/seats.js` combines the check
and the write into ONE atomic database operation. MongoDB guarantees
no other request can interleave between the check and the write. If
two users hit "hold seat A1" at the same instant, only one query
actually matches and updates the document — the other gets `null`
back, which tells the code "sorry, seat's gone."

## 2. Why holds expire by re-checking at write time, not a background job
Considered: MongoDB TTL index that auto-deletes expired holds.
Rejected because: TTL cleanup runs on a background sweep roughly every
60 seconds — not precise enough to guarantee no gap right at the
expiry boundary. Instead, the SAME atomic query that acquires a new
hold also reclaims an expired one: `{ status: 'held', heldUntil: {
$lt: now } }` is part of the `$or` filter in the hold route. This
means expiry is enforced exactly at the moment someone tries to act,
not on a delayed schedule.

## 3. Why a database transaction wraps the final booking write
Confirming a booking requires two related writes: marking seats
"booked" AND creating the Booking record. If only one succeeded (e.g.
a crash between the two), you'd get orphaned data — a seat marked
booked with no booking record, or vice versa. `session.withTransaction()`
in `routes/bookings.js` guarantees both writes commit together or
both roll back together.

## 4. Why the payment call happens BEFORE the transaction, not inside it
A transaction can only roll back database writes — it can't "un-charge"
a real payment gateway, because that's an external HTTP call, not a
database operation. So the flow is: call payment gateway first, and
only start the DB transaction once payment has actually succeeded.
If payment fails, the seat hold is deliberately left untouched so the
user can retry without losing their seat immediately (see `bookings.js`
comments).

## 5. Why seat holds re-verify at confirm-time, not just at select-time
A user could select a seat, then take 3 minutes filling out a form
before hitting "confirm" — by then their hold may have expired. The
`/bookings/confirm` route re-queries seats with `heldBy` and
`heldUntil` conditions rather than trusting the client's claim that it
still holds them. Never trust client-side state for anything
security- or money-related — always re-verify server-side.

## Known gaps (be upfront about these if asked)
- No refund logic if a payment "succeeds" but a later step fails —
  in a real system you'd need a compensating transaction or a queue-based
  saga pattern for this, since transactions can't undo external API calls.
- Seat-hold expiry is only checked reactively (when someone tries to
  act on that seat) — there's no proactive cleanup job that frees
  visibly-expired-but-untouched seats. A cron job or MongoDB change
  stream could add that.
- No admin role / dashboard yet — anyone can create a show via the API.
- Client polls every 3 seconds for seat updates instead of using
  WebSockets for instant push — a reasonable v2 upgrade, and a good
  thing to mention if asked "what would you change."

## One-liner for "how is this different from BookMyShow?"
"This isn't trying to be a BookMyShow clone — it's a focused
implementation of the hardest backend problem those platforms solve:
guaranteeing two people can never book the same seat, even under
concurrent load, without leaving the database in an inconsistent state
if payment or a write fails partway through."

## Quick answers for common questions
- **Why this database?** MongoDB's atomic `findOneAndUpdate` and
  multi-document transactions (available since MongoDB 4.0) directly
  solve both core problems here without needing external locking
  infrastructure.
- **How would you scale it?** The seat-hold logic is already
  stateless and safe across multiple server instances since the
  atomicity guarantee lives in the database, not in server memory —
  so horizontal scaling just means adding more Node instances behind
  a load balancer. The database itself would need sharding/replica
  sets at very large scale.
- **What are the bottlenecks?** All holds on the same seat still
  serialize through MongoDB's per-document write lock — fine for
  realistic ticket-booking traffic (contention is per-seat, not
  global), but worth naming as the theoretical bottleneck.
