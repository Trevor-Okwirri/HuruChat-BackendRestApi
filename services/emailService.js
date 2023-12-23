const SibApiV3Sdk = require("sib-api-v3-sdk");

const sendinblueApiKey =
  "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";
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications["api-key"];
apiKey.apiKey = sendinblueApiKey;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

const sendEmail = async (to, subject, html) => {
  const sender = {
    email: "huruchatke@gmail.com",
    name: "Huru Chat",
  };

  const receivers = [
    {
      email: to,
    },
  ];

  try {
    const sendEmailResponse = await apiInstance.sendTransacEmail({
      sender,
      to: receivers,
      subject: subject,
      htmlContent: html,
    });

    console.log("Email sent successfully. Response:", sendEmailResponse);

    return sendEmailResponse;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error; // Re-throw the error for further handling
  }
};
const sendVerificationEmail = async (to, token) => {
  const subject = "🚀 Welcome to Huru Chat - Verify Your Email 🚀";
  const verificationLink = `http://localhost:3000/users/verify/${token}`;

  // Use HTML to create an attractive email body
  const html = `
    <div style="background-color: #2c3e50; padding: 20px; border-radius: 10px; color: #ecf0f1; text-align: center;">
      <h2 style="color: #3498db;">Welcome to Huru Chat!</h2>
      <p>Thank you for joining the Huru Chat community. To get started, please verify your email address.</p>
      
      <div style="margin-top: 20px;">
        <a href="${verificationLink}" style="padding: 10px 20px; background-color: #e74c3c; color: white; text-decoration: none; display: inline-block; border-radius: 5px; font-weight: bold; text-transform: uppercase;">Verify Email</a>
      </div>
      
      <div style="margin-top: 30px;">
        <img src="https://yourdomain.com/path/to/huruchat-logo.png" alt="Huru Chat Logo" style="display: block; margin: 0 auto; max-width: 150px;">
      </div>
    </div>
  `;

  console.log("Verification link:", verificationLink);

  try {
    const info = await sendEmail(to, subject, html);
    console.log("Verification email sent:", info);
  } catch (error) {
    console.error("Error sending verification email:", error);
    // Handle the error as needed (e.g., log it, notify the user, etc.)
  }
};

const sendPasswordResetEmail = async (to, resetToken) => {
  const subject = "🔒 Password Reset - Huru Chat";
  const resetLink = `http://localhost:3000/users/reset-password/${resetToken}`;

  // Use HTML to create an attractive email body
  const html = `
    <div style="background-color: #3498db; padding: 20px; border-radius: 10px; color: #ecf0f1; text-align: center;">
      <h2 style="color: #2c3e50;">Password Reset</h2>
      <p>We received a request to reset your password. Click the button below to reset it:</p>
      
      <div style="margin-top: 20px;">
        <a href="${resetLink}" style="padding: 10px 20px; background-color: #e74c3c; color: white; text-decoration: none; display: inline-block; border-radius: 5px; font-weight: bold; text-transform: uppercase;">Reset Password</a>
      </div>
      
      <p style="margin-top: 20px;">If you didn't request a password reset, please ignore this email.</p>
      
      <div style="margin-top: 30px;">
        <img src="https://yourdomain.com/path/to/huruchat-logo.png" alt="Huru Chat Logo" style="display: block; margin: 0 auto; max-width: 150px;">
      </div>
    </div>
  `;

  console.log("Reset link:", resetLink);

  try {
    const info = await sendEmail(to, subject, html);
    console.log("Password reset email sent:", info);
  } catch (error) {
    console.error("Error sending password reset email:", error);
    // Handle the error as needed (e.g., log it, notify the user, etc.)
  }
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
