import "dotenv/config";
import { connectDB } from "./utils/db.js";
import app from "./app.js";

import { createServer } from "http";
import { Server } from "socket.io";

const PORT = process.env.PORT || 5000;

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

app.set("io", io);

io.on("connection", (socket) => {
  socket.on("join_show", (showId) => {
    socket.join(showId);
  });
});

connectDB()
  .then(() => {
    httpServer.listen(PORT, () => console.log(`BookFlow server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });
