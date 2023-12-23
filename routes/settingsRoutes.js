// routes/settingsRoutes.js
const express = require("express");
const router = express.Router();
const config = require("../config");
const Settings = require("../models/Settings");
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
// Get user settings
router.get("/settings", authenticateJWT, async (req, res) => {
  try {
    const userId = req.user._id;
    const userSettings = await Settings.findOne({ userId });
    res.json({ settings: userSettings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Update user settings
router.put("/settings", authenticateJWT, async (req, res) => {
  try {
    const userId = req.user._id;
    const { chatPreferences, appPreferences } = req.body;

    // Validate and update chat preferences
    if (chatPreferences) {
      // Validate chat preferences and update accordingly
      // For example, check if 'receiveNotifications', 'darkMode', etc., are valid boolean values
    }

    // Validate and update app preferences
    if (appPreferences) {
      // Validate app preferences and update accordingly
      // For example, check if 'language', 'themeColor', etc., have valid values
    }

    // Update the settings document
    const updatedSettings = await Settings.findOneAndUpdate(
      { userId },
      { $set: { chatPreferences, appPreferences } },
      { new: true, upsert: true }
    );

    res.json({ settings: updatedSettings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
