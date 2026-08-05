import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import app from "../app.js";
import User from "../models/User.js";
import Show from "../models/Show.js";
import Seat from "../models/Seat.js";

let mongoServer;

beforeAll(async () => {
  process.env.JWT_SECRET = "testsecret";
  process.env.HOLD_DURATION_MS = "5000"; // Short hold for tests

  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

function generateToken(userId, role = "user") {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

describe("Concurrency - Atomic Seat Booking", () => {
  it("should prevent double-booking when two users try to hold the same seat at the exact same time", async () => {
    // 1. Setup Data
    const user1 = await User.create({ name: "User 1", email: "user1@test.com", passwordHash: "hash" });
    const user2 = await User.create({ name: "User 2", email: "user2@test.com", passwordHash: "hash" });

    const show = await Show.create({
      title: "Concurrency Movie",
      venue: "Test Venue",
      startTime: new Date(),
      price: 10,
      rows: 1,
      seatsPerRow: 1
    });

    const seat = await Seat.create({
      show: show._id,
      seatLabel: "A1"
    });

    // 2. Setup requests
    const token1 = generateToken(user1._id);
    const token2 = generateToken(user2._id);

    const req1 = request(app)
      .post(`/api/seats/${seat._id}/hold`)
      .set("Authorization", `Bearer ${token1}`);
      
    const req2 = request(app)
      .post(`/api/seats/${seat._id}/hold`)
      .set("Authorization", `Bearer ${token2}`);

    // 3. Fire requests concurrently using Promise.all to simulate race condition
    const [res1, res2] = await Promise.all([req1, req2]);

    // 4. Assertions: Exactly ONE should succeed with 200, the other should fail with 409
    const statuses = [res1.status, res2.status].sort();
    
    expect(statuses).toEqual([200, 409]);

    // Verify the database state reflects the winner
    const winnerRes = res1.status === 200 ? res1 : res2;
    const winnerUserId = winnerRes === res1 ? user1._id.toString() : user2._id.toString();

    const updatedSeat = await Seat.findById(seat._id);
    expect(updatedSeat.status).toBe("held");
    expect(updatedSeat.heldBy.toString()).toBe(winnerUserId);
  });
});
