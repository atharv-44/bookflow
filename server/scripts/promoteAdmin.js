import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";

const email = process.argv[2];

if (!email) {
  console.error("Usage: node scripts/promoteAdmin.js <user-email>");
  process.exit(1);
}

async function promote() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { $set: { role: "admin" } },
      { new: true }
    );

    if (!user) {
      console.error(`User not found with email: ${email}`);
    } else {
      console.log(`Success! User ${user.email} is now an admin.`);
    }
  } catch (err) {
    console.error("Error updating user:", err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

promote();
