// routes/momentRoutes.js
const express = require("express");
const router = express.Router();
const Moment = require("../models/Moment");
const User = require("../models/User");
const config = require("../config");
const Notification = require("../models/Notification");

const authenticateJWT = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Missing token" });
  }

  try {
    const decoded = jwt.verify(token.replace("Bearer ", ""), config.secretKey); // Replace 'your-secret-key' with your actual secret key

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

// Route to create a moment
router.post("/create", authenticateJWT, async (req, res) => {
  try {
    const { description, media } = req.body;

    // Check if description is provided
    if (!description) {
      return res.status(400).json({ error: "Description is required" });
    }

    // Create a new moment
    const newMoment = await Moment.create({
      user: req.user._id, // Use the user from the JWT token
      description,
      media, // Assuming media is an array of media items
    });

    // Get users who are in the same group or have had a chat with the sender
    const usersToNotify = await User.find({
      $or: [
        { groups: { $in: req.user.groups } },
        { _id: { $in: req.user.chats } },
      ],
      _id: { $ne: req.user._id }, // Exclude the sender
      blockedUsers: { $ne: req.user._id }, // Exclude users who have blocked the sender
    });

    // Notify each user
    const notificationMessage = `${req.user.username} posted a new moment: ${newMoment.description}`;
    for (const userToNotify of usersToNotify) {
      const notification = await Notification.create({
        sender: req.user._id,
        recipient: userToNotify._id,
        moment: newMoment._id,
        message: notificationMessage,
      });

      // Optionally, you can send the notification or save it to be sent later
      // For simplicity, we'll save the notification here
      await notification.save();
    }

    res.json({ message: "Moment created successfully", moment: newMoment });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route to get the current user's moment
router.get("/moments/me", authenticateJWT, async (req, res) => {
  try {
    const moment = await Moment.findOne({ user: req.user._id });
    res.json({ moment });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route to delete the current user's moment
router.delete("/moments/me", authenticateJWT, async (req, res) => {
  try {
    const moment = await Moment.findOneAndDelete({ user: req.user._id });

    if (!moment) {
      return res.status(404).json({ error: "Moment not found" });
    }

    // Notify users in the same group and those who had a chat with the user
    const user = await User.findById(req.user._id);
    const notificationsRecipients = [
      ...user.groupParticipants,
      ...user.chatParticipants,
    ];

    notificationsRecipients.forEach(async (recipient) => {
      if (!recipient.equals(req.user._id)) {
        // Exclude the user deleting the moment
        const notification = await Notification.create({
          sender: req.user._id,
          recipient,
          moment: moment._id,
          message: "Moment deleted",
        });
        await notification.save();
      }
    });

    res.json({ message: "Moment deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route to view a specific user's moment
router.get("/moments/:userId", authenticateJWT, async (req, res) => {
  try {
    const userId = req.params.userId;

    // Check if the requesting user is in the same group or has had a chat with the target user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isInSameGroup = user.groupParticipants.includes(req.user._id);
    const hasHadChat = user.chatParticipants.includes(req.user._id);

    if (!isInSameGroup && !hasHadChat) {
      return res
        .status(403)
        .json({ error: "Forbidden: Unauthorized access to view moment" });
    }

    const moment = await Moment.findOne({ user: userId });

    if (!moment) {
      return res.status(404).json({ error: "Moment not found" });
    }

    res.json({ moment });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route to comment on a moment
router.post(
  "/moments/:momentId/comments",
  authenticateJWT,
  async (req, res) => {
    try {
      const momentId = req.params.momentId;
      const { text } = req.body;

      const moment = await Moment.findById(momentId);

      if (!moment) {
        return res.status(404).json({ error: "Moment not found" });
      }

      // Check if the requesting user is in the same group or has had a chat with the owner of the moment
      const user = await User.findById(moment.user);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const isInSameGroup = user.groupParticipants.includes(req.user._id);
      const hasHadChat = user.chatParticipants.includes(req.user._id);

      if (!isInSameGroup && !hasHadChat) {
        return res.status(403).json({
          error: "Forbidden: Unauthorized access to comment on moment",
        });
      }

      moment.comments.push({
        user: req.user._id,
        text,
      });

      await moment.save();

      res.json({ message: "Comment added successfully", moment });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);
// Route to get moments uploaded by users you've chatted with or are in the same group
router.get("/moments/feed", authenticateJWT, async (req, res) => {
  try {
    const requestingUserId = req.user._id;

    // Find users in the same group as the requesting user
    const requestingUser = await User.findById(requestingUserId);
    if (!requestingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const usersInSameGroup = requestingUser.groupParticipants;

    // Find users the requesting user has chatted with
    const usersInChat = requestingUser.chatParticipants;

    // Combine the users from the group and chat to get a unique set
    const uniqueUserIds = Array.from(
      new Set([...usersInSameGroup, ...usersInChat])
    );

    // Find moments uploaded by users in the combined set
    const moments = await Moment.find({
      user: { $in: uniqueUserIds },
    }).populate("user");

    res.json({ moments });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
