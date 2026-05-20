const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: process.env.EMAIL_PORT || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const sendForgotPasswordEmail = async (customerName, customerEmail, otp, expiryMinutes = 10) => {
  try {
    const templatePath = path.join(__dirname, "../modules/customer/emailTemplates/forgotPassword.html");
    let htmlTemplate = fs.readFileSync(templatePath, "utf8");

    htmlTemplate = htmlTemplate.replace("{{customerName}}", customerName);
    htmlTemplate = htmlTemplate.replace("{{otp}}", otp);
    htmlTemplate = htmlTemplate.replace("{{expiryMinutes}}", expiryMinutes);
    htmlTemplate = htmlTemplate.replace("{{customerPortalUrl}}", process.env.CUSTOMER_FRONTEND_URL || "#");

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Machine Service Management"}" <${process.env.EMAIL_USER}>`,
      to: customerEmail,
      subject: "Password Reset OTP",
      html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Email sending error:", error);
    return { success: false, error: error.message };
  }
};

const sendPasswordResetSuccessEmail = async (customerName, customerEmail) => {
  try {
    const templatePath = path.join(__dirname, "../modules/customer/emailTemplates/passwordResetSuccess.html");
    let htmlTemplate = fs.readFileSync(templatePath, "utf8");

    const resetDate = new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });

    htmlTemplate = htmlTemplate.replace("{{customerName}}", customerName);
    htmlTemplate = htmlTemplate.replace("{{resetDate}}", resetDate);
    htmlTemplate = htmlTemplate.replace("{{customerPortalUrl}}", process.env.CUSTOMER_FRONTEND_URL || "#");

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Machine Service Management"}" <${process.env.EMAIL_USER}>`,
      to: customerEmail,
      subject: "Password Reset Successful",
      html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Email sending error:", error);
    return { success: false, error: error.message };
  }
};

const sendChangeEmailOtp = async (customerName, newEmail, otp, expiryMinutes, oldEmail) => {
  try {
    const templatePath = path.join(__dirname, "../modules/customer/emailTemplates/changeEmailOtp.html");
    let htmlTemplate = fs.readFileSync(templatePath, "utf8");

    htmlTemplate = htmlTemplate.replace("{{customerName}}", customerName);
    htmlTemplate = htmlTemplate.replace("{{otp}}", otp);
    htmlTemplate = htmlTemplate.replace("{{expiryMinutes}}", expiryMinutes);
    htmlTemplate = htmlTemplate.replace("{{oldEmail}}", oldEmail);
    htmlTemplate = htmlTemplate.replace("{{newEmail}}", newEmail);
    htmlTemplate = htmlTemplate.replace("{{customerPortalUrl}}", process.env.CUSTOMER_FRONTEND_URL || "#");

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Machine Service Management"}" <${process.env.EMAIL_USER}>`,
      to: newEmail,
      subject: "Verify Your New Email Address",
      html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Email sending error:", error);
    return { success: false, error: error.message };
  }
};

const sendEmailChangeSuccessNotification = async (customerName, oldEmail, newEmail) => {
  try {
    const templatePath = path.join(__dirname, "../modules/customer/emailTemplates/emailChangeSuccess.html");
    let htmlTemplate = fs.readFileSync(templatePath, "utf8");

    const changeDate = new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });

    htmlTemplate = htmlTemplate.replace("{{customerName}}", customerName);
    htmlTemplate = htmlTemplate.replace(/{{oldEmail}}/g, oldEmail);
    htmlTemplate = htmlTemplate.replace(/{{newEmail}}/g, newEmail);
    htmlTemplate = htmlTemplate.replace("{{changeDate}}", changeDate);
    htmlTemplate = htmlTemplate.replace("{{customerPortalUrl}}", process.env.CUSTOMER_FRONTEND_URL || "#");

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Machine Service Management"}" <${process.env.EMAIL_USER}>`,
      to: oldEmail,
      subject: "Email Changed Successfully",
      html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Email sending error:", error);
    return { success: false, error: error.message };
  }
};

const sendAdminChangePasswordOtp = async (adminEmail, otp, expiryMinutes) => {
  try {
    const templatePath = path.join(__dirname, "../modules/admin/emailTemplates/changePasswordOtp.html");
    let htmlTemplate = fs.readFileSync(templatePath, "utf8");

    htmlTemplate = htmlTemplate.replace("{{otp}}", otp);
    htmlTemplate = htmlTemplate.replace("{{expiryMinutes}}", expiryMinutes);
    htmlTemplate = htmlTemplate.replace("{{adminPortalUrl}}", process.env.ADMIN_FRONTEND_URL || "#");

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Machine Service Management"}" <${process.env.EMAIL_USER}>`,
      to: adminEmail,
      subject: "Admin Password Change OTP",
      html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Email sending error:", error);
    return { success: false, error: error.message };
  }
};

const sendAdminPasswordChangeSuccess = async (adminEmail) => {
  try {
    const templatePath = path.join(__dirname, "../modules/admin/emailTemplates/passwordChangeSuccess.html");
    let htmlTemplate = fs.readFileSync(templatePath, "utf8");

    const changeDate = new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });

    htmlTemplate = htmlTemplate.replace("{{changeDate}}", changeDate);
    htmlTemplate = htmlTemplate.replace("{{adminPortalUrl}}", process.env.ADMIN_FRONTEND_URL || "#");

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Machine Service Management"}" <${process.env.EMAIL_USER}>`,
      to: adminEmail,
      subject: "Admin Password Changed Successfully",
      html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Email sending error:", error);
    return { success: false, error: error.message };
  }
};

const sendWelcomeCredentials = async (customerName, customerEmail, password) => {
  try {
    const templatePath = path.join(__dirname, "../modules/customer/emailTemplates/welcomeCredentials.html");
    let htmlTemplate = fs.readFileSync(templatePath, "utf8");

    htmlTemplate = htmlTemplate.replace("{{customerName}}", customerName);
    htmlTemplate = htmlTemplate.replace("{{customerEmail}}", customerEmail);
    htmlTemplate = htmlTemplate.replace("{{password}}", password);
    htmlTemplate = htmlTemplate.replace("{{customerPortalUrl}}", process.env.CUSTOMER_FRONTEND_URL || "#");

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Machine Service Management"}" <${process.env.EMAIL_USER}>`,
      to: customerEmail,
      subject: "Welcome - Your Account Credentials",
      html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Email sending error:", error);
    return { success: false, error: error.message };
  }
};

module.exports = { sendForgotPasswordEmail, sendPasswordResetSuccessEmail, sendChangeEmailOtp, sendEmailChangeSuccessNotification, sendAdminChangePasswordOtp, sendAdminPasswordChangeSuccess, sendWelcomeCredentials };
