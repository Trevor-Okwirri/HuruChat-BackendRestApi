const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const config = require("../config");

const authenticateJWT = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Missing token" });
  }

  try {
    const decoded = jwt.verify(token.replace("Bearer ", ""), config.secretKey);
    // Fetch the user from the database based on the decoded information
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Attach the user object to the request
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Forbidden: Invalid token" });
  }
};
// Route to get all notifications for the authenticated user
router.get("/", authenticateJWT, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: "desc" })
      .populate("sender", "username");

    res.json({ notifications });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route to mark a notification as read and delete it immediately
router.put(
  "/:notificationId/mark-as-read",
  authenticateJWT,
  async (req, res) => {
    try {
      const { notificationId } = req.params;
      const notification = await Notification.findByIdAndDelete(notificationId);

      res.json({
        message: "Notification marked as read and deleted",
        notification,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

module.exports = router;
