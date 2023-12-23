const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  chatPreferences: {
    receiveNotifications: {
      type: Boolean,
      default: true,
    },
    darkMode: {
      type: Boolean,
      default: false,
    },
    showTypingIndicator: {
      type: Boolean,
      default: true,
    },
    notificationTone: {
      type: String,
      default: "default.mp3", // Default notification tone file
    },
    // Add more chat preferences as needed
  },
  appPreferences: {
    language: {
      type: String,
      default: "en", // Default language code
    },
    themeColor: {
      type: String,
      default: "#3498db", // Default theme color (Hex code)
    },
    fontSize: {
      type: Number,
      default: 14, // Default font size
    },
    // Add more app preferences as needed
  },
  privacySettings: {
    hideOnlineStatus: {
      type: Boolean,
      default: false,
    },
    // Add more privacy settings as needed
  },
  securitySettings: {
    twoFactorAuthentication: {
      type: Boolean,
      default: false,
    },
    // Add more security settings as needed
  },
  // Add more fields for other types of preferences
});

const Settings = mongoose.model("Settings", settingsSchema);

module.exports = Settings;
