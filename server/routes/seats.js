import { Router } from "express";
import mongoose from "mongoose";
import Seat from "../models/Seat.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const HOLD_DURATION_MS = Number(process.env.HOLD_DURATION_MS || 120000); // 2 min default

/**
 * HOLD A SEAT — the answer to "how did you prevent double booking?"
 * ------------------------------------------------------------------
 * This is a single atomic findOneAndUpdate. The filter says: "only
 * match this seat if it's free, OR if it's held but that hold has
 * expired." The update says: "mark it held by me, with a fresh
 * expiry." MongoDB guarantees the whole find+update happens as one
 * indivisible operation at the database level — no other request can
 * squeeze in between the check and the write, which is exactly the
 * gap that caused the double-booking bug in a naive read-then-write
 * implementation.
 *
 * If two users hit this endpoint for the same seat at the same
 * instant, only ONE of these queries will find a matching document
 * and update it. The other gets `null` back — and THAT's how we know
 * to tell the second user "sorry, seat just taken."
 */
router.post("/:seatId/hold", requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const heldUntil = new Date(now.getTime() + HOLD_DURATION_MS);

    const seat = await Seat.findOneAndUpdate(
      {
        _id: req.params.seatId,
        $or: [
          { status: "free" },
          { status: "held", heldUntil: { $lt: now } }, // reclaim expired holds
        ],
      },
      {
        $set: { status: "held", heldBy: req.userId, heldUntil },
      },
      { new: true }
    );

    if (!seat) {
      return res.status(409).json({ error: "Seat is no longer available" });
    }

    res.json(seat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Release a hold early (e.g., user deselects the seat before paying).
// Only the user who holds it can release it — enforced with the same
// atomic-filter pattern, not a separate check-then-write.
router.post("/:seatId/release", requireAuth, async (req, res) => {
  try {
    const seat = await Seat.findOneAndUpdate(
      { _id: req.params.seatId, status: "held", heldBy: req.userId },
      { $set: { status: "free", heldBy: null, heldUntil: null } },
      { new: true }
    );
    if (!seat) return res.status(409).json({ error: "You don't hold this seat" });
    res.json(seat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
