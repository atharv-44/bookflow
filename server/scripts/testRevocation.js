/**
 * WARNING: This script connects to the live database specified by MONGO_URI in .env
 * and fires real HTTP requests against the local server (http://localhost:5000).
 * It will create test users and test shows that are NOT automatically cleaned up.
 * Do not run this against a production database.
 */
import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";

async function runTest() {
  let token;
  const testEmail = "staletest@example.com";
  const testPass = "password123";

  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    // 0. Ensure user exists
    let user = await User.findOne({ email: testEmail });
    if (!user) {
      const bcrypt = await import("bcryptjs");
      const hash = await bcrypt.default.hash(testPass, 10);
      user = await User.create({ name: "Stale Test", email: testEmail, passwordHash: hash });
    }

    // 1. Promote user to admin
    await User.updateOne({ email: testEmail }, { $set: { role: "admin" } });
    console.log("[DB] User promoted to admin.");

    // 2. Login via API
    const loginRes = await fetch("http://localhost:5000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPass })
    });
    const loginData = await loginRes.json();
    token = loginData.token;
    console.log(`[API] Logged in. Token received: ${token ? "YES" : "NO"}`);

    // 3. Hit requireAdmin route (POST /api/shows)
    const showData = { title: "Test Show", venue: "Test", startTime: new Date(), rows: 1, seatsPerRow: 1, price: 10 };
    const adminRes1 = await fetch("http://localhost:5000/api/shows", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(showData)
    });
    console.log(`[API] 1st POST /api/shows (as Admin) -> Status: ${adminRes1.status}`);

    // 4. Demote user directly in DB (simulate out-of-band revocation)
    await User.updateOne({ email: testEmail }, { $set: { role: "user" } });
    console.log("[DB] User demoted to 'user'.");

    // 5. Hit requireAdmin route again WITH SAME TOKEN
    const adminRes2 = await fetch("http://localhost:5000/api/shows", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(showData)
    });
    console.log(`[API] 2nd POST /api/shows (with old token) -> Status: ${adminRes2.status}`);

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

runTest();
