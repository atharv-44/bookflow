import { Router } from "express";
import Show from "../models/Show.js";
import Seat from "../models/Seat.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

// Create a show and generate its seat grid. Admin only.
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, venue, startTime, rows = 5, seatsPerRow = 8, price = 200 } = req.body;
    const show = await Show.create({ title, venue, startTime, rows, seatsPerRow, price });

    const seatDocs = [];
    for (let r = 0; r < rows; r++) {
      const rowLabel = String.fromCharCode(65 + r); // A, B, C...
      for (let s = 1; s <= seatsPerRow; s++) {
        seatDocs.push({ show: show._id, seatLabel: `${rowLabel}${s}` });
      }
    }
    await Seat.insertMany(seatDocs);

    res.status(201).json(show);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", async (req, res) => {
  const shows = await Show.find().sort({ startTime: 1 });
  res.json(shows);
});

router.get("/:id/seats", async (req, res) => {
  // Use an aggregation pipeline so we can sort by row letter first, then by
  // the numeric seat number as an integer (natural order: A1, A2, …, A10).
  // A plain { seatLabel: 1 } sort is lexicographic and would give A1, A10, A2…
  const seats = await Seat.aggregate([
    { $match: { show: (await import("mongoose")).default.Types.ObjectId.createFromHexString(req.params.id) } },
    {
      // Treat expired holds as "free" at read time.
      // The lazy reclaim in the hold endpoint will clean up the DB document
      // the next time someone actually tries to grab the seat. This $addFields
      // stage just makes sure users never see a "held by others" seat that is
      // actually past its expiry window — they couldn't click it if we didn't
      // do this, which would prevent the lazy reclaim from ever triggering.
      $addFields: {
        status: {
          $cond: {
            if: {
              $and: [
                { $eq: ["$status", "held"] },
                { $lt: ["$heldUntil", new Date()] },
              ],
            },
            then: "free",
            else: "$status",
          },
        },
        heldBy: {
          $cond: {
            if: {
              $and: [
                { $eq: ["$status", "held"] },
                { $lt: ["$heldUntil", new Date()] },
              ],
            },
            then: null,
            else: "$heldBy",
          },
        },
      },
    },
    {
      $addFields: {
        _rowPart: { $rtrim: { input: "$seatLabel", chars: "0123456789" } },
        _seatNum: {
          $toInt: {
            $ltrim: {
              input: "$seatLabel",
              chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
            },
          },
        },
      },
    },
    { $sort: { _rowPart: 1, _seatNum: 1 } },
    { $unset: ["_rowPart", "_seatNum"] },
  ]);
  res.json(seats);
});

export default router;
