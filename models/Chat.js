// Chat.js
const mongoose = require("mongoose");
const Notification = require("./Notification");
const User = require("./User");
const Group = require("./Group");

// Reaction schema
const reactionSchema = new mongoose.Schema({
  emoji: {
    type: String,
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
});

// Chat schema
const chatSchema = new mongoose.Schema({
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Group", // Reference the Group model
  },
  dateSent: {
    type: Date,
    default: Date.now,
  },
  attachments: [
    {
      type: {
        type: String, // e.g., "image", "video", "pdf", etc.
        required: true,
      },
      url: {
        type: String,
        required: true,
      },
      // You can add more properties based on the type of attachment
    },
  ],
  isGroupChat: {
    type: Boolean,
    default: false,
  },
  from: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  to: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  payload: {
    type: String,
    required: true,
  },
  isReply: {
    type: Boolean,
    default: false,
  },
  edited: {
    type: Boolean,
    default: false,
  },
  lastEdited: {
    type: Date,
  },
  repliedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Chat",
  },
  reactions: [reactionSchema],
  notificationSent: {
    type: Boolean,
    default: false,
  },
  receivedBy: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      dateReceived: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  readBy: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      dateRead: {
        type: Date,
        default: Date.now,
      },
    },
  ],
});

// Virtual field to get sender's name
chatSchema.virtual("senderName").get(function () {
  return this.from.name;
});
// ... (previous imports and schemas)

// ... (previous imports and schemas)

// Create a post-save hook to trigger a notification
chatSchema.post("save", async function (doc, next) {
  try {
    // Check if the chat is a new message and no notification has been sent
    if (!doc.notificationSent) {
      const senderUser = await User.findById(doc.from);
      let message;

      // Determine the notification message based on chat type
      if (doc.isReply) {
        const repliedToChat = await Chat.findById(doc.repliedTo);

        const repliedToUser = await User.findById(repliedToChat.from);

        if (doc.isGroupChat) {
          let group = await Group.findById(doc.group);
          if (senderUser.username == repliedToUser.username) {
            message = `[${group.name}] : ${senderUser.username} replied chat: "${doc.payload}"`;
          } else {
            message = `[${group.name}] : ${senderUser.username} replied to ${repliedToUser.username}'s chat`;
          }
          group.participants = group.participants.filter(
            (objId) => !objId.equals(senderUser._id)
          );
          // Notify all participants in the group about the new message
          group.participants.forEach(async (participant) => {
            const not = await Notification.create({
              sender: doc.from,
              recipient: participant,
              chat: doc._id,
              message,
            });
            await not.save();
          });
        } else {
          message = `${senderUser.username} replied to your chat: '${doc.payload}'`;
          // Notify all participants in the group about the new message
          doc.to.forEach(async (participant) => {
            const not = await Notification.create({
              sender: doc.from,
              recipient: participant,
              chat: doc._id,
              message,
            });
            await not.save();
          });
        }
      } else if (doc.isGroupChat) {
        const group = await Group.findById(doc.group);
        message = `[${group.name}]: ${senderUser.username} has sent a message: '${doc.payload}'`;
        // Notify all participants in the group about the new message
        doc.to.forEach(async (participant) => {
          if (!participant.equals(doc.from)) {
            const not = await Notification.create({
              sender: doc.from,
              recipient: participant,
              chat: doc._id,
              message,
            });
            await not.save();
          }
        });
      } else {
        message = `${senderUser.username} has sent you a message: '${doc.payload}'`;

        // Notify all recipients in a private chat
        doc.to.forEach(async (recipient) => {
          const not = await Notification.create({
            sender: doc.from,
            recipient,
            chat: doc._id,
            message,
          });
          await not.save();
        });
      }

      // Set notificationSent to true to prevent duplicate notifications
      doc.notificationSent = true;
      await doc.save(); // Save the updated document
    }

    next();
  } catch (error) {
    console.error(error);
    next(error);
  }
});

// ... (rest of the code)

const Chat = mongoose.model("Chat", chatSchema);

module.exports = Chat;
