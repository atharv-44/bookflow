import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    show: { type: mongoose.Schema.Types.ObjectId, ref: "Show", required: true },
    seats: [{ type: mongoose.Schema.Types.ObjectId, ref: "Seat", required: true }],
    amount: { type: Number, required: true },
    paymentStatus: { type: String, enum: ["success", "failed"], required: true },
  },
  { timestamps: true }
);

export default mongoose.model("Booking", bookingSchema);
