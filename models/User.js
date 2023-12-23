// // models/User.js
// const mongoose = require("mongoose");
// const bcrypt = require("bcrypt");

// const loginHistorySchema = new mongoose.Schema({
//   timestamp: { type: Date, default: Date.now },
//   ipAddress: String,
// });

// const userSchema = new mongoose.Schema({
//   username: { type: String, unique: true },
//   profilePicUrl: { type: String },
//   email: { type: String, unique: true },
//   password: String,
//   isFrozen: { type: Boolean, default: false },
//   blockedUsersChat: [
//     {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//     },
//   ],
//   blockedUsersMoments: [
//     {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//     },
//   ],
//   isEmailVerified: { type: Boolean, default: false },
//   loginHistory: [loginHistorySchema],
//   isAdmin: { type: Boolean, default: false },
//   roles: [
//     {
//       type: String,
//     },
//   ],
// });

// userSchema.pre("save", async function (next) {
//   const user = this;

//   // Capture login details before saving
//   user.captureLoginDetails();

//   if (!user.isModified("password")) return next();

//   const salt = await bcrypt.genSalt(10);
//   const hash = await bcrypt.hash(user.password, salt);
//   user.password = hash;
//   next();
// });

// userSchema.methods.comparePassword = async function (candidatePassword) {
//   return bcrypt.compare(candidatePassword, this.password);
// };

// userSchema.methods.captureLoginDetails = function () {
//   const loginDetails = {
//     ipAddress: this.lastLoginIpAddress,
//     timestamp: new Date(),
//   };

//   this.loginHistory.push(loginDetails);
// };

// const User = mongoose.model("User", userSchema);
// module.exports = User;

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const loginHistorySchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  ipAddress: String,
});

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  profilePicUrl: { type: String },
  email: { type: String, unique: true },
  password: String,
  isFrozen: { type: Boolean, default: false },
  blockedUsersChat: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  blockedUsersMoments: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  isEmailVerified: { type: Boolean, default: false },
  loginHistory: [loginHistorySchema],
  isAdmin: { type: Boolean, default: false },
  roles: [
    {
      type: String,
    },
  ],
  resetToken: {
    type: String,
  },
  resetTokenExpires: {
    type: Date,
  },
  onlineStatus: {
    type: Boolean,
    default: false,
  },
  lastSeenOnline: {
    type: Date,
  },
});

userSchema.pre("save", async function (next) {
  const user = this;

  // Capture login details before saving
  user.captureLoginDetails();

  if (!user.isModified("password")) return next();

  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(user.password, salt);
  user.password = hash;
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.captureLoginDetails = function () {
  const loginDetails = {
    ipAddress: this.lastLoginIpAddress,
    timestamp: new Date(),
  };

  this.loginHistory.push(loginDetails);
};

const User = mongoose.model("User", userSchema);
module.exports = User;
