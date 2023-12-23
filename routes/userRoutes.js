// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const config = require("../config"); // Ensure the correct path to your configuration file
const User = require("../models/User");
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require("../services/emailService");
const bcrypt = require("bcrypt");
const ResetToken = require("../models/ResetToken");
const multer = require("multer");
// Set up multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });
const { initializeApp } = require("firebase/app");
const {
  ref,
  getDownloadURL,
  uploadBytesResumable,
  getStorage,
  deleteObject,
  getMetadata,
} = require("firebase/storage");
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
const storage = getStorage();
const generateToken = (user) => {
  const payload = {
    userId: user.userId,
  };
  return jwt.sign(payload, config.secretKey, { expiresIn: "1h" });
};

// Function to generate a verification token
const generateVerificationToken = (user) => {
  const payload = {
    userId: user._id,
    email: user.email,
  };

  const token = jwt.sign(payload, config.secretKey, { expiresIn: "1 day" }); // Adjust the expiration time as needed

  return token;
};

// Function to handle errors
const handleErrors = (res, error) => {
  console.error(error);
  res.status(500).json({ error: "Internal Server Error" });
};

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

router.post("/register", upload.single("profilePic"), async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if the required fields are provided
    if (!username || !email || !password) {
      return res
        .status(400)
        .json({ error: "Username, email, and password are required" });
    }

    // Check if the username is already in use
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ error: "Username already in use" });
    }

    // Check if the email is already in use
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ error: "Email already in use" });
    }

    // Upload profile picture to Firebase Storage if provided
    let profilePicUrl = null;
    if (req.file) {
      function giveCurrentDateTime() {
        const currentDate = new Date();

        const year = currentDate.getFullYear();
        const month = (currentDate.getMonth() + 1).toString().padStart(2, "0");
        const day = currentDate.getDate().toString().padStart(2, "0");

        const hours = currentDate.getHours().toString().padStart(2, "0");
        const minutes = currentDate.getMinutes().toString().padStart(2, "0");
        const seconds = currentDate.getSeconds().toString().padStart(2, "0");

        const dateTimeString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

        return dateTimeString;
      }
      const dateTime = giveCurrentDateTime();
      console.log(ref);
      const storageRef = ref(
        storage,
        `files/profilePictures/${req.file.originalname}${dateTime}`
      );

      const metadata = {
        contentType: req.file.mimetype,
      };

      const profilePicSnapshot = await uploadBytesResumable(
        storageRef,
        req.file.buffer,
        metadata
      );
      profilePicUrl = await getDownloadURL(profilePicSnapshot.ref);
      console.log(profilePicUrl);
    }

    // Create a new user with or without the profile picture URL
    const newUser = new User({ username, email, password, profilePicUrl });
    await newUser.save();

    // Generate a verification token
    const verificationToken = generateVerificationToken(newUser);

    // Send verification email
    sendVerificationEmail(newUser.email, verificationToken);

    // Respond with a reminder if no profile picture is provided
    if (!profilePicUrl) {
      return res.status(400).json({
        message:
          "User registered successfully, but adding a profile picture is recommended for a better user experience.",
        reminder: "You can always add or update your profile picture later.",
      });
    }

    res.json({
      message:
        "User registered successfully. Please check your email to verify your account.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Verification route
router.get("/verify/:token", async (req, res) => {
  try {
    const token = req.params.token;

    // Verify the token
    const decoded = jwt.verify(token, config.secretKey);

    // Find the user by id from the token
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if the user is already verified
    if (user.isEmailVerified) {
      // If already verified, render the success EJS template
      const userEmail = user.email;
      return res.render("verification-success", { userEmail });
    }

    // Mark the user as verified
    user.isEmailVerified = true;
    await user.save();

    // Render the success EJS template with animation and "HURU" standing out
    const userEmail = user.email;
    res.render("verification-success", { userEmail });
  } catch (error) {
    console.error(error);
    // Render the error EJS template with a shaking animation
    const errorMessage = "Invalid or expired token";
    res.status(401).render("verification-error", { errorMessage });
  }
});

// Route for resending email verification
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;

    // Find the user by email
    const user = await User.findOne({ email });

    // Check if the user exists
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if the user has already verified their email
    if (user.isEmailVerified) {
      // If already verified, return a nice HTML page
      return res.render("verification-success", { userEmail });
    }

    // Generate a new verification token
    const verificationToken = generateVerificationToken(user);

    // Send the new verification email
    sendVerificationEmail(email, verificationToken);

    res.json({ message: "Verification email resent successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get user profile route (requires authentication)
router.get("/profile", authenticateJWT, async (req, res) => {
  try {
    // Extract user from the token (provided by the authenticateJWT middleware)
    const user = req.user;

    // Fetch user profile from the database (exclude sensitive information)
    const userProfile = await User.findById(user.userId).select(
      "-password -email"
    );

    // Check if the user profile exists
    if (!userProfile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    // Send the user profile as a JSON response
    res.json(userProfile);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Update user profile route (requires authentication)
router.put(
  "/profile",
  authenticateJWT,
  upload.single("profilePic"),
  async (req, res) => {
    try {
      const requester = req.user;
      console.log(req.file);
      const userProfile = await User.findById(requester._id);

      if (!userProfile) {
        return res.status(404).json({ error: "User profile not found" });
      }

      // Check if a new profile picture is provided in the request
      if (req.file) {
        // Check if there is an existing profile picture URL
        if (userProfile.profilePicUrl) {
          // Create a reference to the existing profile picture in Firebase Storage
          const existingProfilePicRef = ref(storage, userProfile.profilePicUrl);

          // Delete the existing profile picture from Firebase Storage
          await deleteObject(existingProfilePicRef);
        }

        // Upload the new profile picture to Firebase Storage
        const newProfilePicRef = ref(
          storage,
          `profile_pics/${req.file.fieldname}`
        );
        await uploadBytesResumable(newProfilePicRef, req.file.buffer, {
          contentType: req.file.mimetype,
        });

        // Get the download URL of the newly uploaded profile picture
        const downloadURL = await getDownloadURL(newProfilePicRef);
        // Update the user profile with the new profile picture URL
        req.body.profilePicUrl = downloadURL;
      }

      // Check if the new username is provided and different from the current one
      if (req.body.username && req.body.username !== userProfile.username) {
        // Check if the new username is already taken
        const existingUsername = await User.findOne({
          username: req.body.username,
        });
        if (existingUsername) {
          return res.status(400).json({ error: "Username already in use" });
        }
      }

      // Check if the new email is provided and different from the current one
      if (req.body.email && req.body.email !== userProfile.email) {
        // Check if the new email is already taken
        const existingEmail = await User.findOne({ email: req.body.email });
        if (existingEmail) {
          return res.status(400).json({ error: "Email already in use" });
        }
      }

      // Update other user profile information in the database
      const updatedUser = await User.findByIdAndUpdate(
        requester._id,
        req.body,
        { new: true }
      );

      res.json(updatedUser);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

// Get all users route (requires authentication)
router.get("/all", authenticateJWT, async (req, res) => {
  try {
    // Extract user from the token (provided by the authenticateJWT middleware)
    const requester = req.user;

    // Fetch non-admin users from the database (exclude sensitive information)
    const nonAdminUsers = await User.find().select("-password -email");
    res.json(nonAdminUsers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Middleware to check if reset token is valid and not expired
const validateResetToken = (resetToken) => {
  try {
    const decodedToken = jwt.verify(resetToken, config.secretKey);
    return decodedToken;
  } catch (error) {
    console.error(error);
    return null;
  }
};

// Route to render the reset password page
router.get("/reset-password/:resetToken", async (req, res) => {
  const resetToken = req.params.resetToken;
  const decodedToken = validateResetToken(resetToken);

  if (!decodedToken) {
    return res.render("invalid-token");
  }
  // Find the user by email from the token
  const user = await User.findOne({
    email: decodedToken.email,
    resetToken,
    resetTokenExpires: { $gt: new Date() },
  });

  if (!user) {
    return res.render("invalid-token");
  }

  res.render("reset-password", { resetToken, error: "" });
});

// Route to handle password reset
router.post("/reset-password/:resetToken", async (req, res) => {
  const resetToken = req.params.resetToken;
  const newPassword = req.body.newPassword;
  const confirmPassword = req.body.confirmPassword;

  const decodedToken = validateResetToken(resetToken);

  if (!decodedToken) {
    return res.render("invalid-token");
  }

  // Find the user by email from the token
  const user = await User.findOne({
    email: decodedToken.email,
    resetToken,
    resetTokenExpires: { $gt: new Date() },
  });

  if (!user) {
    return res.render("invalid-token");
  }

  try {
    if (newPassword !== confirmPassword) {
      return res.render("reset-password", {
        resetToken,
        error: "Passwords do not match.",
      });
    }

    user.password = newPassword;
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    await user.save();

    res.render("password-reset-success");
  } catch (error) {
    console.error(error);
    res.render("reset-password", {
      resetToken,
      error: "An error occurred. Please try again.",
    });
  }
});

// Route to initiate password reset
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const requester = await User.findOne({ email });

    // Check if the requester is an admin or the user for their own account
    if (!(requester.email === email)) {
      return res.status(403).json({
        error: "Unauthorized to initiate password reset for this account",
      });
    }

    // Find the user by email
    const user = await User.findOne({ email });

    // Check if the user exists
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Generate a password reset token with user email
    const payload = {
      email: user.email,
    };
    const resetToken = jwt.sign(payload, config.secretKey, { expiresIn: "1h" });

    // Update the user with the reset token
    user.resetToken = resetToken;
    user.resetTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();
    await sendPasswordResetEmail(email, resetToken);
    res.json({ message: "Password reset link sent successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Login route
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find the user by email
    const user = await User.findOne({ email });

    // Check if the user exists
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check if the password is correct using comparePassword method
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check if the user is verified
    if (!user.isEmailVerified) {
      return res.status(403).json({ error: "Email not verified" });
    }

    // Capture and store login details
    const loginDetails = {
      ipAddress: req.connection.remoteAddress, // Capture IP address
      timestamp: new Date(), // Capture current date and time
    };

    // Save the login details to the user's login history
    user.loginHistory.push(loginDetails);

    // Save the user to capture login details
    await user.save();

    // Generate JWT token with user information
    const token = generateToken({
      userId: user._id,
      email: user.email,
      isAdmin: user.isAdmin, // Include isAdmin status if applicable
    });

    // Include additional user information in the response if needed
    const userData = {
      userId: user._id,
      username: user.username,
      email: user.email,
      // Add more user data as needed
    };

    res.json({ token, user: userData });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Update password route (requires authentication)
router.put("/update-password", authenticateJWT, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Extract user from the token (provided by the authenticateJWT middleware)
    const loggedInUser = req.user;
    // Find the user by ID
    const existingUser = await User.findById(loggedInUser._id);

    // Check if the current password is correct
    if (!(await existingUser.comparePassword(currentPassword))) {
      return res.status(401).json({ error: "Invalid current password" });
    }

    // Update the password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    existingUser.password = hashedPassword;
    await existingUser.save();

    res.json({ message: "Password updated successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Mark user as frozen route (requires authentication and admin privileges)
router.put("/freeze-user/:userId", authenticateJWT, async (req, res) => {
  try {
    // Extract user from the token
    const adminUser = req.user;

    // Check if the admin user has the necessary privileges
    if (!adminUser.isAdmin) {
      return res
        .status(403)
        .json({ error: "Unauthorized: Admin privileges required." });
    }

    // Find the user by ID
    const userToFreeze = await User.findById(req.params.userId);

    // Check if the user exists
    if (!userToFreeze) {
      return res.status(404).json({ error: "User not found" });
    }

    // Mark the user as frozen
    userToFreeze.isFrozen = true;
    await userToFreeze.save();

    res.json({ message: "User marked as frozen." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route to block chats from a specific user
router.post("/block-chat/:userId", authenticateJWT, async (req, res) => {
  try {
    const currentUser = req.user;
    const userToBlockId = req.params.userId;

    // Check if the user to block exists
    const userToBlock = await User.findById(userToBlockId);
    if (!userToBlock) {
      return res.status(404).json({ error: "User to block not found" });
    }

    // Check if the user is trying to block themselves
    if (currentUser._id.equals(userToBlock._id)) {
      return res.status(400).json({ error: "You cannot block yourself" });
    }

    // Check if the user is already blocked
    if (currentUser.blockedUsersChat.includes(userToBlock._id)) {
      return res
        .status(400)
        .json({ error: "User is already blocked in chats" });
    }

    // Block the user in chats
    currentUser.blockedUsersChat.push(userToBlock._id);
    await currentUser.save();

    res.json({ message: "User blocked in chats successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route to block moments from a specific user
router.post("/block-moments/:userId", authenticateJWT, async (req, res) => {
  try {
    const currentUser = req.user;
    const userToBlockId = req.params.userId;

    // Check if the user to block exists
    const userToBlock = await User.findById(userToBlockId);
    if (!userToBlock) {
      return res.status(404).json({ error: "User to block not found" });
    }

    // Check if the user is trying to block themselves
    if (currentUser._id.equals(userToBlock._id)) {
      return res.status(400).json({ error: "You cannot block yourself" });
    }

    // Check if the user is already blocked
    if (currentUser.blockedUsersMoments.includes(userToBlock._id)) {
      return res
        .status(400)
        .json({ error: "User is already blocked in moments" });
    }

    // Block the user in moments
    currentUser.blockedUsersMoments.push(userToBlock._id);
    await currentUser.save();

    res.json({ message: "User blocked in moments successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Update user roles route (requires authentication and admin privileges)
router.put("/update-roles/:userId", authenticateJWT, async (req, res) => {
  try {
    // Extract user from the token (provided by the authenticateJWT middleware)
    const adminUser = req.user;

    // Check if the user has the necessary admin privileges
    if (!adminUser.isAdmin) {
      return res
        .status(403)
        .json({ error: "Unauthorized: Admin privileges required." });
    }

    // Find the user by ID
    const userToUpdate = await User.findById(req.params.userId);

    // Check if the user exists
    if (!userToUpdate) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update user roles
    userToUpdate.roles = req.body.roles; // Assuming roles are provided in the request body

    // Save the updated user
    await userToUpdate.save();

    res.json({ message: "User roles updated successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Update user roles route (requires authentication and admin privileges)
router.put("/toggle-admin/:userId", authenticateJWT, async (req, res) => {
  try {
    // Extract user from the token (provided by the authenticateJWT middleware)
    const adminUser = req.user;

    // Check if the user has the necessary admin privileges
    if (!adminUser.isAdmin) {
      return res
        .status(403)
        .json({ error: "Unauthorized: Admin privileges required." });
    }

    // Find the user by ID
    const userToUpdate = await User.findById(req.params.userId);

    // Check if the user exists
    if (!userToUpdate) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update user priviledge
    if (userToUpdate.isAdmin) {
      userToUpdate.isAdmin = false;

      // Save the updated user
      await userToUpdate.save();

      res.json({ message: "Admin now User" });
    } else {
      userToUpdate.isAdmin = true;

      // Save the updated user
      await userToUpdate.save();

      res.json({ message: "User now Admin" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get frozen users route (requires authentication and admin privileges)
router.get("/frozen-users", authenticateJWT, async (req, res) => {
  try {
    // Check if the authenticated user has admin privileges
    if (!req.user.isAdmin) {
      return res
        .status(403)
        .json({ error: "Unauthorized: Admin privileges required." });
    }

    // Find users marked as frozen
    const frozenUsers = await User.find({ isFrozen: true });

    res.json({ frozenUsers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/users-not-frozen", authenticateJWT, async (req, res) => {
  try {
    // Check if the authenticated user has admin privileges
    if (!req.user.isAdmin) {
      return res
        .status(403)
        .json({ error: "Unauthorized: Admin privileges required." });
    }

    // Find users not marked as frozen
    const usersNotFrozen = await User.find({ isFrozen: false });

    res.json({ usersNotFrozen });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/login-history", authenticateJWT, async (req, res) => {
  try {
    // Extract user from the token (provided by the authenticateJWT middleware)
    const user = req.user;

    // Fetch user's login history
    const loginHistory = user.loginHistory;

    res.json({ loginHistory });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/unblock-chat/:userId", authenticateJWT, async (req, res) => {
  try {
    const currentUser = req.user;
    const userToUnblockId = req.params.userId;

    // Check if the user to unblock exists
    const userToUnblock = await User.findById(userToUnblockId);
    if (!userToUnblock) {
      return res.status(404).json({ error: "User to unblock not found" });
    }

    // Check if the user is trying to unblock themselves
    if (currentUser._id.equals(userToUnblock._id)) {
      return res.status(400).json({ error: "You cannot unblock yourself" });
    }

    // Check if the user is blocked
    const blockedIndex = currentUser.blockedUsersChat.indexOf(
      userToUnblock._id
    );
    if (blockedIndex === -1) {
      return res.status(400).json({ error: "User is not blocked in chats" });
    }

    // Unblock the user in chats
    currentUser.blockedUsersChat.splice(blockedIndex, 1);
    await currentUser.save();

    res.json({ message: "User unblocked in chats successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
router.put("/unfreeze-user/:userId", authenticateJWT, async (req, res) => {
  try {
    // Extract user from the token
    const adminUser = req.user;

    // Check if the admin user has the necessary privileges
    if (!adminUser.isAdmin) {
      return res
        .status(403)
        .json({ error: "Unauthorized: Admin privileges required." });
    }

    // Find the user by ID
    const userToUnfreeze = await User.findById(req.params.userId);

    // Check if the user exists
    if (!userToUnfreeze) {
      return res.status(404).json({ error: "User not found" });
    }

    // Unfreeze the user
    userToUnfreeze.isFrozen = false;
    await userToUnfreeze.save();

    res.json({ message: "User unfrozen successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/unblock-moments/:userId", authenticateJWT, async (req, res) => {
  try {
    const currentUser = req.user;
    const userToUnblockId = req.params.userId;

    // Check if the user to unblock exists
    const userToUnblock = await User.findById(userToUnblockId);
    if (!userToUnblock) {
      return res.status(404).json({ error: "User to unblock not found" });
    }

    // Check if the user is trying to unblock moments from themselves
    if (currentUser._id.equals(userToUnblock._id)) {
      return res
        .status(400)
        .json({ error: "You cannot unblock moments from yourself" });
    }

    // Check if the user is blocked in moments
    const blockedIndex = currentUser.blockedUsersMoments.indexOf(
      userToUnblock._id
    );
    if (blockedIndex === -1) {
      return res.status(400).json({ error: "User is not blocked in moments" });
    }

    // Unblock the user in moments
    currentUser.blockedUsersMoments.splice(blockedIndex, 1);
    await currentUser.save();

    res.json({ message: "User unblocked in moments successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/user/:userId", authenticateJWT, async (req, res) => {
  try {
    // Check if the authenticated user has admin privileges
    if (!req.user.isAdmin) {
      return res
        .status(403)
        .json({ error: "Unauthorized: Admin privileges required." });
    }

    // Find the user by ID (excluding sensitive information)
    const user = await User.findById(req.params.userId).select(
      "-password -email"
    );

    // Check if the user exists
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/blocked-chats", authenticateJWT, async (req, res) => {
  try {
    // Get the current user
    const currentUser = req.user;

    // Populate the blocked users in chats
    await currentUser.populate("blockedUsersChat").execPopulate();

    res.json({ blockedUsersChat: currentUser.blockedUsersChat });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/blocked-moments", authenticateJWT, async (req, res) => {
  try {
    // Get the current user
    const currentUser = req.user;

    // Populate the blocked users in moments
    await currentUser.populate("blockedUsersMoments").execPopulate();

    res.json({ blockedUsersMoments: currentUser.blockedUsersMoments });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route to set user online status to true
router.put("/set-online", authenticateJWT, async (req, res) => {
  try {
    const user = req.user;

    // Set online status to true
    user.online = true;

    // Save the user with updated online status
    await user.save();

    res.json({ message: "Online status set to true", user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route to set user online status to false and update last seen
router.put("/set-offline", authenticateJWT, async (req, res) => {
  try {
    const user = req.user;

    // Set online status to false
    user.online = false;

    // Update last seen to the current date and time
    user.lastSeen = new Date();

    // Save the user with updated online status and last seen
    await user.save();

    res.json({ message: "Online status set to false", user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// // Delete user account route (requires authentication)
router.delete("/delete-account", authenticateJWT, async (req, res) => {
  try {
    console.log("Hello");
    // Extract user from the token (provided by the authenticateJWT middleware)
    const currentUser = req.user;

    // Find and remove the user account
    const deletedUser = await User.findByIdAndDelete(currentUser._id);

    if (!deletedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Delete the user profile picture from Firebase if it exists
    if (deletedUser.profilePicUrl) {
      const storageRef = ref(storage, deletedUser.profilePicUrl);
      await deleteObject(storageRef);
    }

    res.json({ message: "User account deleted successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
module.exports = router;
