import mongoose from "mongoose";

const showSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    venue: { type: String, required: true },
    startTime: { type: Date, required: true },
    rows: { type: Number, required: true, default: 5 },
    seatsPerRow: { type: Number, required: true, default: 8 },
    price: { type: Number, required: true, default: 200 },
  },
  { timestamps: true }
);

export default mongoose.model("Show", showSchema);
