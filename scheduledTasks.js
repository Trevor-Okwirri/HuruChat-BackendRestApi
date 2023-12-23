const cron = require("node-cron");
const Chat = require("./models/Chat"); // Adjust the path

// Schedule a task to run daily at a specific time (adjust as needed)
const scheduledTask = cron.schedule("0 0 * * *", async () => {
  try {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // Find chats with multiple recipients that are older than one month
    const chatsToDelete = await Chat.find({
      to: { $exists: true, $not: { $size: 0 } }, // Ensure there are recipients
      dateRead: { $lt: oneMonthAgo },
      notificationSent: true,
    });

    // Check if all recipients have read the chat
    const chatsToDeleteFiltered = chatsToDelete.filter((chat) => {
      const allRecipientsRead = chat.to.every((recipient) =>
        chat.readBy.some((read) => read.user.equals(recipient))
      );

      return allRecipientsRead;
    });

    // Delete chats that meet the criteria
    await Chat.deleteMany({
      _id: { $in: chatsToDeleteFiltered.map((chat) => chat._id) },
    });

    console.log("Scheduled task: Removed old read chats.");
  } catch (error) {
    console.error("Scheduled task error:", error);
  }
});

module.exports = scheduledTask;
