import mongoose from "mongoose";

/**
 * SEAT STATUS MODEL
 * ------------------------------------------------------------------
 * status: "free" | "held" | "booked"
 *
 * Why heldUntil lives directly on the Seat document instead of a
 * separate "Hold" collection with a TTL index:
 *
 * MongoDB TTL indexes only sweep expired documents roughly once every
 * 60 seconds in a background thread — that's fine for "eventually
 * clean up," but NOT precise enough to prevent a race exactly at the
 * 2-minute boundary (two users could both see a "stale but not yet
 * TTL-deleted" hold as unavailable, or worse, both grab it in the
 * gap). Instead, every attempt to acquire a seat checks and reclaims
 * an expired hold IN THE SAME atomic operation — see the seats route
 * for the actual query. This means expiry is enforced exactly at
 * read/write time, not on a delayed background sweep.
 */
const seatSchema = new mongoose.Schema(
  {
    show: { type: mongoose.Schema.Types.ObjectId, ref: "Show", required: true },
    seatLabel: { type: String, required: true }, // e.g. "A1"
    status: { type: String, enum: ["free", "held", "booked"], default: "free" },
    heldBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    heldUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

seatSchema.index({ show: 1, seatLabel: 1 }, { unique: true });

export default mongoose.model("Seat", seatSchema);
