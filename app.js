const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const momentRoutes = require("./routes/momentRoutes");
const userRoutes = require("./routes/userRoutes");
const chatRoutes = require("./routes/chatRoutes");
const notificationAuthMiddleware = require("./middleware/notificationAuthMiddleware");
const settingsRoutes = require("./routes/settingsRoutes");
const deviceInfoMiddleware = require("./middleware/deviceInfo");
const scheduledTask = require("./scheduledTasks");
const http = require("http");
const initializeSocketIO = require("./socket");
const multer = require("multer");
const { initializeApp } = require("firebase/app");
const { getStorage } = require("firebase/storage");
const app = express();

// Initialize Firebase with your config
// Make sure to replace the config with your Firebase project config
const firebaseConfig = {
  apiKey: "AIzaSyD4LibZ1PtMlZUEsJnI1qerP5ts1h-N-GA",

  authDomain: "huruchat-16994.firebaseapp.com",

  projectId: "huruchat-16994",

  storageBucket: "huruchat-16994.appspot.com",

  messagingSenderId: "676101945157",

  appId: "1:676101945157:web:070a1d57c4ea3b8a47702c",

  measurementId: "G-FKTFP0X9G0",
};

initializeApp(firebaseConfig);

app.upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.use(cors());
app.use(helmet());
app.use(deviceInfoMiddleware.captureDeviceInfo);

// Rate limiting middleware (adjust according to your needs)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);

// Routes
app.get("/", (req, res) => {
  res.render("index");
});

app.use("/moments", momentRoutes);
app.use("/users", userRoutes);
app.use("/chats", chatRoutes);
app.use("/api/settings", settingsRoutes);

// Use authentication and authorization middleware for notifications
app.use("/notifications", notificationAuthMiddleware.authenticateUser);
app.use(
  "/notifications/:notificationId",
  notificationAuthMiddleware.authorizeUser
);

// Connect to MongoDB
mongoose.connect("mongodb://localhost:27017/chatApp", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.connection.on("connected", () => {
  console.log("Connected to MongoDB");
});

scheduledTask.start();

// Socket.IO connection handling
const server = http.createServer(app);
const io = initializeSocketIO(server);

// Start the server with Socket.IO
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
const storage = getStorage();
module.exports = storage;
