import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import showRoutes from "./routes/shows.js";
import seatRoutes from "./routes/seats.js";
import bookingRoutes from "./routes/bookings.js";

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000" }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/shows", showRoutes);
app.use("/api/seats", seatRoutes);
app.use("/api/bookings", bookingRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

export default app;
