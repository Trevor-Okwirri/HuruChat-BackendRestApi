const socketIO = require("socket.io");

function initializeSocketIO(server) {
  const io = socketIO(server);

  io.on("connection", (socket) => {
    console.log("A user connected");

    // Handle incoming messages
    socket.on("message", (message) => {
      console.log("Message received:", message);

      // Broadcast the message to all connected clients
      io.emit("message", message);
    });

    // Handle disconnections
    socket.on("disconnect", () => {
      console.log("User disconnected");
    });
  });

  return io;
}

module.exports = initializeSocketIO;
