import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Server-side validation exists independently of the client's checks.
// The client validation is purely for UX (instant feedback); this is
// the real enforcement, since a client can always be bypassed (Postman,
// curl, a modified frontend, etc).
function validateSignup({ name, email, password }) {
  if (!name || name.trim().length < 2) return "Name must be at least 2 characters.";
  if (!email || !EMAIL_RE.test(email)) return "A valid email is required.";
  if (!password || password.length < 8) return "Password must be at least 8 characters.";
  return null;
}

router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const validationError = validateSignup({ name, email, password });
    if (validationError) return res.status(400).json({ error: validationError });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: email.toLowerCase(), passwordHash });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase() });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
