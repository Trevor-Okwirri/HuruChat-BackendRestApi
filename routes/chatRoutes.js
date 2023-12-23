const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Chat = require("../models/Chat");
const Notification = require("../models/Notification");
const User = require("../models/User");
const config = require("../config");
const Group = require("../models/Group");

// Middleware to authenticate users using the JWT token
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

// Assuming the existing imports and router setup...

router.post("/send", authenticateJWT, async (req, res) => {
  try {
    const { to, group, payload, attachments } = req.body;
    const from = req.user;

    if (!payload && (!attachments || attachments.length === 0)) {
      return res.status(400).json({
        error: "Invalid input data. Payload or attachments required.",
      });
    }

    if (group) {
      const groupObj = await Group.findById(group);

      if (!groupObj || !groupObj.participants.includes(from._id)) {
        return res
          .status(400)
          .json({ error: "Invalid group or sender is not a participant." });
      } else {
        groupObj.participants = groupObj.participants.filter(
          (objId) => !objId.equals(from._id)
        );
        const chat = new Chat({
          from: from._id,
          to: groupObj.participants,
          group,
          payload,
          attachments: attachments || [],
          isGroupChat: true,
        });

        await chat.save();
      }
    } else {
      if (!to || to.length === 0) {
        return res.status(400).json({
          error:
            "Invalid recipient. Recipient is required for individual chats.",
        });
      }
      const recipient = await User.findOne({ username: { $in: to } });

      if (!recipient || recipient.username.length !== to.length) {
        return res.status(400).json({ error: "Invalid recipient." });
      }

      const chat = new Chat({
        from,
        to: recipient._id,
        group,
        payload,
        attachments: attachments || [],
      });

      await chat.save();
    }

    res.status(200).json({ message: "Chat sent successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.post("/reply", authenticateJWT, async (req, res) => {
  try {
    const { chatId, payload, attachments } = req.body;
    const userId = req.user._id;

    const originalChat = await Chat.findById(chatId);

    if (!originalChat) {
      return res.status(404).json({ error: "Original chat not found" });
    }
    const recipientId = originalChat.from;
    const isGroupChat = originalChat.isGroupChat;

    const replyChat = new Chat({
      from: userId,
      to: recipientId,
      group: isGroupChat ? originalChat.group : undefined,
      payload,
      attachments: attachments || [],
      isReply: true,
      repliedTo: originalChat._id,
      isGroupChat,
    });

    await replyChat.save();

    res.status(200).json({ message: "Reply sent successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

//Route to create a group
router.post("/create-group", authenticateJWT, async (req, res) => {
  try {
    const { name, participants, about } = req.body;

    // Check if the required parameters are present
    if (!about || !name || !participants || participants.length === 0) {
      return res.status(400).json({
        error: "Invalid input data. Name ,about and participants are required.",
      });
    }

    // Ensure the creator (req.user) is part of the participants
    if (!participants.includes(req.user.username)) {
      participants.push(req.user.username); // Automatically add the creator
    }
    // Ensure all participants exist
    const participantIds = await User.find(
      { username: { $in: participants } },
      "_id"
    );
    if (participantIds.length !== participants.length) {
      return res
        .status(400)
        .json({ error: "Invalid participants. Ensure all users exist." });
    }

    // Check if a group with the same name already exists for the creator
    const existingGroup = await Group.findOne({
      name,
      createdBy: req.user._id,
    });
    if (existingGroup) {
      return res
        .status(400)
        .json({ error: "You already have a group with the same name." });
    }

    // Create a new group
    const group = new Group({
      name,
      participants: participantIds,
      createdBy: req.user._id,
      admins: [req.user._id],
      about,
      history: [{ action: "Group created", user: req.user._id }],
    });

    // Save the group
    await group.save();

    // Send notifications to all participants
    const senderUser = await User.findById(req.user._id);
    const message = `${senderUser.username} added you to the group: ${name}`;
    for (const participantId of participantIds) {
      if (participantId.toString() !== req.user._id.toString()) {
        await Notification.create({
          sender: req.user._id,
          recipient: participantId,
          message,
        });
      }
    }

    // Return success response
    res.status(200).json({ message: "Group created successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Add participant to group route
router.post("/add-participant/:groupId", authenticateJWT, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const { username } = req.body;

    // Check if the required parameters are present
    if (!username) {
      return res
        .status(400)
        .json({ error: "Invalid input data. Username is required." });
    }

    // Find the group and check if the current user is an admin
    const group = await Group.findById(groupId).populate("admins");
    if (!group) {
      return res.status(404).json({ error: "Group not found." });
    }

    const isAdmin = group.admins.some((admin) =>
      admin._id.equals(req.user._id)
    );
    if (!isAdmin) {
      return res.status(403).json({
        error: "You do not have permission to add participants to this group.",
      });
    }

    // Find the user to be added
    const userToAdd = await User.findOne({ username });
    if (!userToAdd) {
      return res
        .status(400)
        .json({ error: "Invalid username. User not found." });
    }

    // Check if the user is already a participant
    if (
      group.participants.some((participant) =>
        participant.equals(userToAdd._id)
      )
    ) {
      return res
        .status(400)
        .json({ error: "User is already a participant in the group." });
    }

    // Add the user as a participant
    group.participants.push(userToAdd._id);
    await group.save();

    // Send notification to the added participant
    const senderUser = await User.findById(req.user._id);
    const message = `${senderUser.username} added you to the group: ${group.name}`;
    await Notification.create({
      sender: req.user._id,
      recipient: userToAdd._id,
      message,
    });

    // Update group history
    group.history.push({
      action: `Participant added : ${userToAdd.username}`,
      user: userToAdd._id,
    });
    await group.save();

    // Return success response
    res.status(200).json({ message: "Participant added successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Add participants to group route
router.post("/add-participants/:groupId", authenticateJWT, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const { participants } = req.body;

    // Check if the required parameters are present
    if (!participants || participants.length === 0) {
      return res
        .status(400)
        .json({ error: "Invalid input data. Participants are required." });
    }

    // Find the group and check if the current user is an admin
    const group = await Group.findById(groupId).populate("admins");
    if (!group) {
      return res.status(404).json({ error: "Group not found." });
    }

    const isAdmin = group.admins.some((admin) =>
      admin._id.equals(req.user._id)
    );
    if (!isAdmin) {
      return res.status(403).json({
        error: "You do not have permission to add participants to this group.",
      });
    }

    // Find the users to be added
    const usersToAdd = await User.find({ username: { $in: participants } });
    const existingParticipants = group.participants.map((participant) =>
      participant.toString()
    );

    // Filter out users who are already participants
    const newParticipants = usersToAdd.filter(
      (user) => !existingParticipants.includes(user._id.toString())
    );

    // Add the new participants to the group
    group.participants.push(...newParticipants.map((user) => user._id));
    await group.save();

    // Send notifications to the added participants
    const senderUser = await User.findById(req.user._id);
    const notificationPromises = newParticipants.map(async (addedUser) => {
      const message = `${senderUser.username} added you to the group: ${group.name}`;
      await Notification.create({
        sender: req.user._id,
        recipient: addedUser._id,
        message,
      });
    });

    await Promise.all(notificationPromises);

    // Update group history
    group.history.push({
      action: "Participants added : ",
      users: newParticipants.map((user) => user._id),
    });
    await group.save();

    // Return success response
    res.status(200).json({ message: "Participants added successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Make participant admin route
router.put("/make-admin/:groupId", authenticateJWT, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const { participantUsername } = req.body;

    // Find the group and check if the current user is an admin
    const group = await Group.findById(groupId).populate("admins");
    if (!group) {
      return res.status(404).json({ error: "Group not found." });
    }

    const isAdmin = group.admins.some((admin) =>
      admin._id.equals(req.user._id)
    );
    if (!isAdmin) {
      return res.status(403).json({
        error:
          "You do not have permission to make participants admins in this group.",
      });
    }

    // Find the participant user by username
    const participantUser = await User.findOne({
      username: participantUsername,
    });
    if (!participantUser) {
      return res.status(404).json({ error: "Participant not found." });
    }

    // Check if the participant is already an admin
    if (group.admins.some((admin) => admin._id.equals(participantUser._id))) {
      return res
        .status(400)
        .json({ error: "Participant is already an admin in the group." });
    }

    // Make the participant an admin
    group.admins.push(participantUser._id);

    // Update group history with the admin's username
    const senderUser = await User.findById(req.user._id);
    group.history.push({
      action: `${senderUser.username} made ${participantUsername} an admin`,
      user: participantUser._id,
      admin: senderUser.username,
    });
    await group.save();

    // Send notification to the participant
    const message = `${senderUser.username} made you an admin in the group: ${group.name}`;
    await Notification.create({
      sender: req.user._id,
      recipient: participantUser._id,
      message,
    });

    // Return success response
    res
      .status(200)
      .json({ message: "Participant made an admin successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Leave group route
router.put("/leave/group/:groupId", authenticateJWT, async (req, res) => {
  try {
    const groupId = req.params.groupId;

    // Find the group
    const group = await Group.findById(groupId).populate("admins participants");
    if (!group) {
      return res.status(404).json({ error: "Group not found." });
    }

    // Find the participant user
    const participantUser = await User.findById(req.user._id);
    if (!participantUser) {
      return res.status(404).json({ error: "Participant not found." });
    }

    // Check if the participant is the only admin, if yes, reject leaving voluntarily
    const isAdmin = group.admins.some((admin) =>
      admin._id.equals(req.user._id)
    );
    if (isAdmin && group.admins.length === 1) {
      return res
        .status(403)
        .json({ error: "The only admin cannot leave the group voluntarily." });
    }

    // Remove the participant from the group's participants
    group.participants = group.participants.filter(
      (participant) => !participant._id.equals(req.user._id)
    );

    // If the participant is an admin, remove them from the admins list
    if (isAdmin) {
      group.admins = group.admins.filter(
        (admin) => !admin._id.equals(req.user._id)
      );
    }

    // Update group history with the participant's username
    group.history.push({
      action: `${req.user.username} left`,
      user: req.user._id,
      username: req.user.username,
    });
    await group.save();

    // Send notification to other participants
    const senderUser = await User.findById(req.user._id);
    const message = `${senderUser.username} left the group: ${group.name}`;
    group.participants.forEach(async (participant) => {
      if (!participant._id.equals(req.user._id)) {
        await Notification.create({
          sender: req.user._id,
          recipient: participant._id,
          message,
        });
      }
    });

    // Return success response
    res.status(200).json({ message: "Left group successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Get group details route
router.get("/group/:groupId", authenticateJWT, async (req, res) => {
  try {
    const groupId = req.params.groupId;

    // Find the group
    const group = await Group.findById(groupId).populate("admins participants");
    if (!group) {
      return res.status(404).json({ error: "Group not found." });
    }

    // Return group details
    res.status(200).json({ group });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Get user's groups route
router.get("/user-groups", authenticateJWT, async (req, res) => {
  try {
    const userId = req.user._id;

    // Find groups where the user is a participant or admin
    const groups = await Group.find({
      $or: [{ participants: userId }, { admins: userId }],
    });

    // Return user's groups
    res.status(200).json({ groups });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.put("/update-group/:groupId", authenticateJWT, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const { name, profilePicture, about } = req.body;

    // Find the group
    const group = await Group.findById(groupId).populate("admins participants");
    if (!group) {
      return res.status(404).json({ error: "Group not found." });
    }

    // Check if the user making the request is an admin of the group
    const isAdmin = group.admins.some((admin) =>
      admin._id.equals(req.user._id)
    );
    if (!isAdmin) {
      return res
        .status(403)
        .json({ error: "You are not authorized to update this group." });
    }

    // Create a history entry for the update
    const historyEntry = { user: req.user._id, date: Date.now() };

    // Update the group details
    if (name && name !== group.name) {
      historyEntry.action = `Group name changed to ${name}`;
      group.name = name;
    }

    if (profilePicture && profilePicture !== group.profilePicture) {
      historyEntry.action = "Group picture updated";
      group.profilePicture = profilePicture;
    }

    if (about && about !== group.about) {
      historyEntry.action = `Group about information updated to ${about}`;
      group.about = about;
    }

    if (historyEntry.action) {
      group.history.push(historyEntry);
    }

    await group.save();

    // Send notifications to participants about the update
    const message = `${req.user.username} updated group details: ${historyEntry.action}`;
    group.participants.forEach(async (participant) => {
      if (!participant._id.equals(req.user._id)) {
        await Notification.create({
          sender: req.user._id,
          recipient: participant._id,
          message,
        });
      }
    });

    // Return success response
    res.status(200).json({ message: "Group details updated successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Get group history route
router.get("/group/:groupId/history", authenticateJWT, async (req, res) => {
  try {
    const groupId = req.params.groupId;

    // Find the group
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found." });
    }

    // Return group history
    res.status(200).json({ history: group.history });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Get group participants route
router.get(
  "/group/:groupId/participants",
  authenticateJWT,
  async (req, res) => {
    try {
      const groupId = req.params.groupId;

      // Find the group
      const group = await Group.findById(groupId).populate("participants");
      if (!group) {
        return res.status(404).json({ error: "Group not found." });
      }

      // Return group participants
      res.status(200).json({ participants: group.participants });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error." });
    }
  }
);
// Force participant to leave group route
router.put(
  "/force-leave/group/:groupId/:participantId",
  authenticateJWT,
  async (req, res) => {
    try {
      const groupId = req.params.groupId;
      const participantId = req.params.participantId;

      // Find the group
      const group = await Group.findById(groupId).populate(
        "admins participants"
      );
      if (!group) {
        return res.status(404).json({ error: "Group not found." });
      }

      // Find the participant user
      const participantUser = await User.findById(participantId);
      if (!participantUser) {
        return res.status(404).json({ error: "Participant not found." });
      }

      // Check if the current user is an admin
      const isAdmin = group.admins.some((admin) =>
        admin._id.equals(req.user._id)
      );
      if (!isAdmin) {
        return res.status(403).json({
          error:
            "You do not have permission to force a participant to leave the group.",
        });
      }

      // Remove the participant from the group's participants
      group.participants = group.participants.filter(
        (participant) => !participant._id.equals(participantId)
      );

      // Update group history with the participant's username
      group.history.push({
        action: `${User.findById(participantId).username} forced to leave by ${
          req.user.username
        }`,
        user: req.user._id,
        username: req.user.username,
      });
      await group.save();

      // Send notification to the forced participant
      const senderUser = await User.findById(req.user._id);
      const message = `You were forced to leave the group: ${group.name} by ${senderUser.username}`;
      await Notification.create({
        sender: req.user._id,
        recipient: participantId,
        message,
      });

      // Send notification to other participants
      const notificationMessage = `${participantUser.username} was forced to leave the group: ${group.name} by ${senderUser.username}`;
      group.participants.forEach(async (participant) => {
        if (
          !participant._id.equals(req.user._id) &&
          !participant._id.equals(participantId)
        ) {
          await Notification.create({
            sender: req.user._id,
            recipient: participant._id,
            message: notificationMessage,
          });
        }
      });

      // Return success response
      res
        .status(200)
        .json({ message: "Forced participant to leave group successfully." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error." });
    }
  }
);

// Route to mark a message as read
router.patch("/mark-as-read/:chatId", authenticateJWT, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    let chat = await Chat.findById(chatId);

    // Check if the user is the recipient of the chat
    if (!chat.to.includes(userId)) {
      return res.status(403).json({
        error: "You are not authorized to mark this message as read.",
      });
    }

    // Check if the user has already read the chat
    if (chat.readBy.some((user) => user.user.equals(userId))) {
      return res.status(400).json({
        error: "Message has already been marked as read by this user.",
      });
    }

    chat.readBy.push({ user: userId, dateRead: new Date() });

    const newChat = await Chat.findByIdAndUpdate(
      chatId,
      { readBy: chat.readBy },
      { new: true }
    );

    res.json({ message: "Message marked as read", chat: newChat });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route to delete all messages for a specific user with authentication
router.delete("/delete-all/:userId", authenticateJWT, async (req, res) => {
  try {
    const { userId } = req.params;

    // Ensure that the authenticated user is the intended recipient or sender
    if (req.user._id.toString() !== userId) {
      return res.status(403).json({
        error: "Forbidden: Unauthorized access to delete all messages",
      });
    }

    // Soft delete: Mark all messages as deleted
    const result = await Chat.updateMany(
      { $or: [{ from: userId }, { to: userId }] },
      { $set: { deleted: true } }
    );

    res.json({ message: "All messages deleted", result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route to archive messages for a specific user with authentication
router.post("/archive/:userId", authenticateJWT, async (req, res) => {
  try {
    const { userId } = req.params;

    // Ensure that the authenticated user is the intended recipient or sender
    if (req.user._id.toString() !== userId) {
      return res
        .status(403)
        .json({ error: "Forbidden: Unauthorized access to archive messages" });
    }

    // Archive: Mark messages as archived
    const result = await Chat.updateMany(
      { $or: [{ from: userId }, { to: userId }] },
      { $set: { archived: true } }
    );

    res.json({ message: "Messages archived", result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route to restore archived messages for a specific user with authentication
router.post("/restore-archived/:userId", authenticateJWT, async (req, res) => {
  try {
    const { userId } = req.params;

    // Ensure that the authenticated user is the intended recipient or sender
    if (req.user._id.toString() !== userId) {
      return res.status(403).json({
        error: "Forbidden: Unauthorized access to restore archived messages",
      });
    }

    // Restore archived messages
    const result = await Chat.updateMany(
      { $or: [{ from: userId }, { to: userId }], archived: true },
      { $set: { archived: false } }
    );

    res.json({ message: "Archived messages restored", result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
// Route to handle reactions on a message with authentication
router.post("/react/:chatId", authenticateJWT, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { emoji } = req.body;

    // Use the user ID from the JWT token
    const userIdFromToken = req.user._id;

    const chat = await Chat.findByIdAndUpdate(
      chatId,
      { $push: { reactions: { emoji, user: userIdFromToken } } },
      { new: true }
    );

    // Check if the chat is a group chat
    if (chat.isGroupChat) {
      // If it's a group chat, notify all participants in the group about the reaction
      const group = await Group.findById(chat.group);

      group.participants.forEach(async (participant) => {
        if (!participant.equals(userIdFromToken)) {
          await Notification.create({
            sender: userIdFromToken,
            recipient: participant,
            chat: chat._id,
            message: `[${group.name}] \`${req.user.username}\` reacted to the message: '${emoji}' in the group chat.`,
          });
        }
      });
    } else {
      // If it's not a group chat, notify only the sender of the original message about the reaction
      if (userIdFromToken !== chat.from.toString()) {
        await Notification.create({
          sender: userIdFromToken,
          recipient: chat.from,
          chat: chat._id,
          message: `You received a reaction from \`${req.user.username}\` on your message: ${emoji}`,
        });
      }
    }

    res.json({ message: "Reaction added successfully", chat });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route to update/edit a message (within ten minutes of being sent) with authentication
router.put("/edit/:chatId", authenticateJWT, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { content } = req.body;

    // Check if content is provided
    if (!content) {
      return res
        .status(400)
        .json({ error: "Bad Request: Content is required" });
    }

    const chat = await Chat.findById(chatId);

    // Check if the chat message exists
    if (!chat) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Ensure that the authenticated user is the sender of the message
    if (req.user._id.toString() !== chat.from.toString()) {
      return res
        .status(403)
        .json({ error: "Forbidden: Unauthorized access to edit message" });
    }

    // Check if the message is editable (within ten minutes of being sent)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    if (chat.dateSent < tenMinutesAgo) {
      return res
        .status(403)
        .json({ error: "Forbidden: Message can no longer be edited" });
    }

    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { payload: content, edited: true, lastEdited: new Date() },
      { new: true }
    );

    // Notify recipients about the edited message
    let notificationMessage = `A message has been edited: '${content}'`;
    if (chat.isGroupChat) {
      notificationMessage = `[${chat.group.name}] ${notificationMessage}`;
      // Notify all participants in the group about the edited message
      chat.to.forEach(async (participant) => {
        if (!participant.equals(chat.from)) {
          const not = await Notification.create({
            sender: updatedChat.from,
            recipient: participant,
            chat: updatedChat._id,
            message: notificationMessage,
          });
          await not.save();
        }
      });
    } else {
      // Notify the individual recipient about the edited message
      const not = await Notification.create({
        sender: updatedChat.from,
        recipient: chat.to,
        chat: updatedChat._id,
        message: notificationMessage,
      });
      await not.save();
    }

    res.json({ message: "Message updated successfully", chat: updatedChat });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route to delete a message with authentication
router.delete("/delete/:chatId", authenticateJWT, async (req, res) => {
  try {
    const { chatId } = req.params;

    // Soft delete: Mark the message as deleted
    const deletedChat = await Chat.findByIdAndUpdate(
      chatId,
      { deleted: true },
      { new: true }
    );

    // Ensure that the authenticated user is the sender of the message
    if (req.user._id.toString() !== deletedChat.from.toString()) {
      return res
        .status(403)
        .json({ error: "Forbidden: Unauthorized access to delete message" });
    }

    // Optionally, you can notify the recipient of the deleted message
    await Notification.create({
      sender: deletedChat.from,
      recipient: deletedChat.to,
      chat: deletedChat._id,
      message: "A message has been deleted",
    });

    res.json({ message: "Message deleted successfully", chat: deletedChat });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
// Route to search messages based on a query string
router.get("/search", authenticateJWT, async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res
        .status(400)
        .json({ error: "Bad Request: Missing query parameter" });
    }

    const userId = req.user._id;

    const matchedChats = await Chat.find({
      $or: [
        {
          from: userId,
          payload: { $regex: query, $options: "i" },
        },
        {
          to: userId,
          payload: { $regex: query, $options: "i" },
        },
        {
          isGroupChat: true,
          "group.participants": userId,
          payload: { $regex: query, $options: "i" },
        },
        // Add more conditions for other searchable fields
        // Example: { someField: { $regex: query, $options: "i" } },
      ],
      // Add more conditions for other searchable fields
      // Example: { anotherField: { $regex: query, $options: "i" } },
    });

    res.json({ matchedChats });
  } catch (error) {
    handleError(res, error);
  }
});

// Helper function for consistent error handling
const handleError = (res, error) => {
  console.error(error);
  res.status(500).json({ error: "Internal Server Error" });
};

// Route to mark a chat as received
router.patch("/receive/:chatId", authenticateJWT, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    // Find the chat
    const chat = await Chat.findById(chatId);

    // Check if the chat exists
    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // Check if the user is the recipient of the chat
    if (!chat.to.includes(userId)) {
      return res.status(403).json({
        error: "You are not authorized to mark this chat as received.",
      });
    }

    // Check if the chat has already been marked as received by the user
    if (chat.receivedBy.some((user) => user.user.equals(userId))) {
      return res.status(400).json({
        error: "Chat has already been marked as received by this user.",
      });
    }

    // Mark the chat as received
    chat.receivedBy.push({ user: userId, dateReceived: new Date() });

    // Save the updated chat
    await chat.save();

    res.json({ message: "Chat marked as received", chat });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route to retrieve unread messages for the authenticated user
router.get("/unread", authenticateJWT, async (req, res) => {
  try {
    const userId = req.user._id; // Assuming you have user information attached through authentication middleware

    // Fetch unread messages for the user
    const unreadMessages = await Chat.find({
      to: userId,
      "readBy.user": { $ne: userId }, // Check if the user's ID is not in the readBy array
    });

    res.json({ unreadMessages });
  } catch (error) {
    handleError(res, error);
  }
});

// Route to retrieve messages not received by the authenticated user
router.get("/not-received", authenticateJWT, async (req, res) => {
  try {
    const userId = req.user._id; // Assuming you have user information attached through authentication middleware

    // Fetch messages not received by the user
    const notReceivedMessages = await Chat.find({
      to: userId,
      "receivedBy.user": { $ne: userId }, // Check if the user's ID is not in the receivedBy array
    });

    res.json({ notReceivedMessages });
  } catch (error) {
    handleError(res, error);
  }
});

// Route to retrieve messages by attachment type (e.g., image, video, file)
router.get(
  "/by-attachment/:attachmentType?",
  authenticateJWT,
  async (req, res) => {
    try {
      const attachmentType = req.params.attachmentType;
      const userId = req.user._id;

      // Validate attachment type
      if (
        attachmentType &&
        !["image", "video", "file"].includes(attachmentType)
      ) {
        return res.status(400).json({
          error: "Bad Request: Invalid attachmentType parameter",
        });
      }

      // Build the query based on the attachment type
      const query = {
        $or: [{ from: userId }, { to: userId }],
      };

      if (attachmentType) {
        query["attachments.type"] = attachmentType;
      }

      // Fetch messages based on the query
      const messagesByAttachmentType = await Chat.find(query);

      res.json({ messagesByAttachmentType });
    } catch (error) {
      handleError(res, error);
    }
  }
);

router.get("/", authenticateJWT, async (req, res) => {
  try {
    const userId = req.user._id;

    // Fetch chats where the user is either the sender or receiver
    const userChats = await Chat.find({
      $or: [{ from: userId }, { to: userId }],
    });

    res.json({ userChats });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route to delete a group and its accompanying chats
router.delete("/groups/:groupId", authenticateJWT, async (req, res) => {
  try {
    const { groupId } = req.params;

    // Find the group
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if the authenticated user is the creator of the group
    if (req.user._id.toString() !== group.creator.toString()) {
      return res
        .status(403)
        .json({ error: "Forbidden: Unauthorized access to delete group" });
    }

    // Find and delete all chats associated with the group
    const deletedChats = await Chat.deleteMany({ group: groupId });

    // Notify group members about the deletion
    const deletionMessage = `The group "${group.name}" has been deleted.`;
    group.participants.forEach(async (participant) => {
      const not = await Notification.create({
        sender: req.user._id,
        recipient: participant,
        message: deletionMessage,
      });
      await not.save();
    });

    // Delete the group
    await Group.findByIdAndDelete(groupId);

    res.json({ message: "Group and chats deleted successfully", deletedChats });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
