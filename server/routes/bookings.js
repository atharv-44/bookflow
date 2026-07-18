import { Router } from "express";
import mongoose from "mongoose";
import Seat from "../models/Seat.js";
import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Fake payment gateway. Real gateways are called over HTTP and are
// NOT part of your database transaction — you can't "roll back" a
// real card charge just by rolling back a DB write. This is why the
// payment call happens BEFORE the transaction starts below, not
// inside it.
function simulatePayment(amount) {
  const success = Math.random() > 0.15; // ~85% success rate, on purpose
  return { success, transactionRef: `PAY-${Date.now()}` };
}

/**
 * CONFIRM BOOKING — the answer to "why did you use a transaction?"
 * ------------------------------------------------------------------
 * Two DB writes need to succeed or fail TOGETHER:
 *   1. Mark each seat's status as "booked"
 *   2. Create the Booking record referencing those seats
 *
 * Without a transaction, imagine step 1 succeeds for seat A1 but the
 * server crashes (or hits a DB error) before step 2 runs — you'd end
 * up with a seat permanently marked "booked" with NO booking record
 * anywhere, and the user charged with nothing to show for it.
 *
 * Wrapping both writes in a session/transaction guarantees: if
 * anything inside fails, EVERYTHING inside rolls back automatically —
 * the seats go back to exactly how they were before this request
 * started, as if it never happened.
 */
router.post("/confirm", requireAuth, async (req, res) => {
  const { showId, seatIds } = req.body;
  if (!showId || !Array.isArray(seatIds) || seatIds.length === 0) {
    return res.status(400).json({ error: "showId and seatIds[] are required" });
  }

  try {
    const show = await Show.findById(showId);
    if (!show) return res.status(404).json({ error: "Show not found" });

    // Verify the caller actually holds every seat they're trying to
    // book, and that none of those holds have expired. This re-checks
    // at confirm-time because a hold could have expired between seat
    // selection and clicking "pay."
    const now = new Date();
    const seats = await Seat.find({
      _id: { $in: seatIds },
      show: showId,
      status: "held",
      heldBy: req.userId,
      heldUntil: { $gt: now },
    });

    if (seats.length !== seatIds.length) {
      return res.status(409).json({
        error: "One or more seats are no longer held by you (hold may have expired)",
      });
    }

    const amount = show.price * seats.length;
    const payment = simulatePayment(amount);

    if (!payment.success) {
      // Payment failed — we deliberately do NOT touch the seats here.
      // The hold remains valid until its natural expiry, so the user
      // can retry payment without losing their seat immediately.
      return res.status(402).json({
        error: "Payment failed. Your seat hold is still active — you can retry.",
      });
    }

    // Payment succeeded — now do the two dependent DB writes atomically.
    const session = await mongoose.startSession();
    let booking;
    try {
      await session.withTransaction(async () => {
        await Seat.updateMany(
          { _id: { $in: seatIds } },
          { $set: { status: "booked", heldBy: null, heldUntil: null } },
          { session }
        );

        const created = await Booking.create(
          [
            {
              user: req.userId,
              show: showId,
              seats: seatIds,
              amount,
              paymentStatus: "success",
            },
          ],
          { session }
        );
        booking = created[0];
      });
    } finally {
      session.endSession();
    }

    res.status(201).json({ booking, transactionRef: payment.transactionRef });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/my", requireAuth, async (req, res) => {
  const bookings = await Booking.find({ user: req.userId })
    .populate("show")
    .populate("seats")
    .sort({ createdAt: -1 });
  res.json(bookings);
});

export default router;
