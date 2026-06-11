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
    console.error("Email sending error:", { message: error.message, code: error.code, status: error.status });
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
    console.error("Email sending error:", { message: error.message, code: error.code, status: error.status });
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
    console.error("Email sending error:", { message: error.message, code: error.code, status: error.status });
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
    console.error("Email sending error:", { message: error.message, code: error.code, status: error.status });
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
    console.error("Email sending error:", { message: error.message, code: error.code, status: error.status });
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
    console.error("Email sending error:", { message: error.message, code: error.code, status: error.status });
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
    console.error("Email sending error:", { message: error.message, code: error.code, status: error.status });
    return { success: false, error: error.message };
  }
};

const sendAdminResetPasswordOtp = async (userName, userEmail, otp, expiryMinutes) => {
  try {
    const templatePath = path.join(__dirname, "../modules/admin/emailTemplates/resetPasswordOtp.html");
    let htmlTemplate = fs.readFileSync(templatePath, "utf8");

    htmlTemplate = htmlTemplate.replace("{{userName}}", userName || "Admin");
    htmlTemplate = htmlTemplate.replace("{{userEmail}}", userEmail);
    htmlTemplate = htmlTemplate.replace("{{otp}}", otp);
    htmlTemplate = htmlTemplate.replace(/{{expiryMinutes}}/g, expiryMinutes);
    htmlTemplate = htmlTemplate.replace("{{adminPortalUrl}}", process.env.ADMIN_FRONTEND_URL || "#");

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Machine Service Management"}" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: "Admin Password Reset OTP",
      html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Email sending error:", { message: error.message, code: error.code, status: error.status });
    return { success: false, error: error.message };
  }
};

const sendSystemUserWelcome = async (userName, userEmail, password, role) => {
  try {
    const templatePath = path.join(__dirname, "../modules/admin/emailTemplates/systemUserWelcome.html");
    let htmlTemplate = fs.readFileSync(templatePath, "utf8");

    const accessUrl = role === "Engineer"
      ? (process.env.ENGINEER_APP_URL || "#")
      : (process.env.ADMIN_FRONTEND_URL || "#");

    htmlTemplate = htmlTemplate.replace("{{userName}}", userName || "User");
    htmlTemplate = htmlTemplate.replace("{{userEmail}}", userEmail);
    htmlTemplate = htmlTemplate.replace("{{password}}", password);
    htmlTemplate = htmlTemplate.replace("{{userRole}}", role);
    htmlTemplate = htmlTemplate.replace(/{{accessUrl}}/g, accessUrl);

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Machine Service Management"}" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: "Welcome - Your Account Credentials",
      html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Email sending error:", { message: error.message, code: error.code, status: error.status });
    return { success: false, error: error.message };
  }
};

const sendSystemUserPasswordResetSuccess = async (userName, userEmail, role) => {
  try {
    const templatePath = path.join(__dirname, "../modules/admin/emailTemplates/systemUserPasswordResetSuccess.html");
    let htmlTemplate = fs.readFileSync(templatePath, "utf8");

    const resetDate = new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });

    const portalUrl = role === "Engineer"
      ? (process.env.ENGINEER_APP_URL || "#")
      : (process.env.ADMIN_FRONTEND_URL || "#");
    const portalLabel = role === "Engineer" ? "Engineer App" : "Admin Portal";

    htmlTemplate = htmlTemplate.replace("{{userName}}", userName || "User");
    htmlTemplate = htmlTemplate.replace("{{resetDate}}", resetDate);
    htmlTemplate = htmlTemplate.replace("{{portalUrl}}", portalUrl);
    htmlTemplate = htmlTemplate.replace("{{portalLabel}}", portalLabel);

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Machine Service Management"}" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: "Your Password Has Been Reset",
      html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Email sending error:", { message: error.message, code: error.code, status: error.status });
    return { success: false, error: error.message };
  }
};

const sendEngineerForgotPasswordOtp = async (engineerName, engineerEmail, otp, expiryMinutes) => {
  try {
    const templatePath = path.join(__dirname, "../modules/engineer/emailTemplates/forgotPassword.html");
    let htmlTemplate = fs.readFileSync(templatePath, "utf8");

    htmlTemplate = htmlTemplate.replace("{{engineerName}}", engineerName || "Engineer");
    htmlTemplate = htmlTemplate.replace("{{otp}}", otp);
    htmlTemplate = htmlTemplate.replace(/{{expiryMinutes}}/g, expiryMinutes);

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Machine Service Management"}" <${process.env.EMAIL_USER}>`,
      to: engineerEmail,
      subject: "Engineer App — Password Reset OTP",
      html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Email sending error:", { message: error.message, code: error.code, status: error.status });
    return { success: false, error: error.message };
  }
};

const sendEngineerPasswordResetSuccess = async (engineerName, engineerEmail) => {
  try {
    const templatePath = path.join(__dirname, "../modules/engineer/emailTemplates/passwordResetSuccess.html");
    let htmlTemplate = fs.readFileSync(templatePath, "utf8");

    const resetDate = new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });

    htmlTemplate = htmlTemplate.replace("{{engineerName}}", engineerName || "Engineer");
    htmlTemplate = htmlTemplate.replace("{{resetDate}}", resetDate);

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Machine Service Management"}" <${process.env.EMAIL_USER}>`,
      to: engineerEmail,
      subject: "Engineer App — Password Reset Successful",
      html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Email sending error:", { message: error.message, code: error.code, status: error.status });
    return { success: false, error: error.message };
  }
};

const sendServiceCallInvoiceEmail = async (data) => {
  try {
    const templatePath = path.join(__dirname, "../modules/admin/emailTemplates/serviceCallInvoice.html");
    let html = fs.readFileSync(templatePath, "utf8");

    const fmt = (n) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    html = html
      .replace(/{{invoiceNumber}}/g,        data.invoiceNumber)
      .replace(/{{invoiceDate}}/g,           data.invoiceDate)
      .replace(/{{customerName}}/g,          data.customerName)
      .replace(/{{callId}}/g,                data.callId)
      .replace(/{{callType}}/g,              data.callType)
      .replace(/{{completedDate}}/g,         data.completedDate)
      .replace(/{{engineerName}}/g,          data.engineerName)
      .replace(/{{totalServiceCharges}}/g,   fmt(data.totalServiceCharges))
      .replace(/{{totalPartsCharges}}/g,     fmt(data.totalPartsCharges))
      .replace(/{{basicTotal}}/g,            fmt(data.basicTotal))
      .replace(/{{cgstPercent}}/g,           data.cgstPercent)
      .replace(/{{cgstAmount}}/g,            fmt(data.cgstAmount))
      .replace(/{{sgstPercent}}/g,           data.sgstPercent)
      .replace(/{{sgstAmount}}/g,            fmt(data.sgstAmount))
      .replace(/{{igstPercent}}/g,           data.igstPercent)
      .replace(/{{igstAmount}}/g,            fmt(data.igstAmount))
      .replace(/{{grandTotal}}/g,            fmt(data.grandTotal))
      .replace(/{{invoiceUrl}}/g,            data.invoiceUrl)
      .replace(/{{companyName}}/g,           data.companyName)
      .replace(/{{companyAddress}}/g,        data.companyAddress)
      .replace(/{{companyPhone}}/g,          data.companyPhone)
      .replace(/{{companyGst}}/g,            data.companyGst)
      .replace(/{{companyEmail}}/g,          data.companyEmail);

    // Machines rows
    const machineRowsMatch = html.match(/{{#each machines}}([\.\s\S]*?){{\/each}}/);
    if (machineRowsMatch) {
      const rowTemplate = machineRowsMatch[1];
      const rows = (data.machines || []).map(m =>
        rowTemplate
          .replace(/{{machineName}}/g,  m.machineName)
          .replace(/{{serialNumber}}/g, m.serialNumber)
      ).join("");
      html = html.replace(/{{#each machines}}[\.\s\S]*?{{\/each}}/, rows);
    }

    // GST conditional blocks
    html = data.cgstPercent > 0 ? html.replace(/{{#if cgst}}([\.\s\S]*?){{\/if}}/g, "$1") : html.replace(/{{#if cgst}}[\.\s\S]*?{{\/if}}/g, "");
    html = data.sgstPercent > 0 ? html.replace(/{{#if sgst}}([\.\s\S]*?){{\/if}}/g, "$1") : html.replace(/{{#if sgst}}[\.\s\S]*?{{\/if}}/g, "");
    html = data.igstPercent > 0 ? html.replace(/{{#if igst}}([\.\s\S]*?){{\/if}}/g, "$1") : html.replace(/{{#if igst}}[\.\s\S]*?{{\/if}}/g, "");

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Machine Service Management"}" <${process.env.EMAIL_USER}>`,
      to: data.customerEmail,
      subject: `Service Call Invoice — ${data.invoiceNumber} (${data.callId})`,
      html,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Invoice email sending error:", { message: error.message });
    return { success: false, error: error.message };
  }
};

module.exports = { sendForgotPasswordEmail, sendPasswordResetSuccessEmail, sendChangeEmailOtp, sendEmailChangeSuccessNotification, sendAdminChangePasswordOtp, sendAdminPasswordChangeSuccess, sendAdminResetPasswordOtp, sendSystemUserWelcome, sendWelcomeCredentials, sendSystemUserPasswordResetSuccess, sendEngineerForgotPasswordOtp, sendEngineerPasswordResetSuccess, sendServiceCallInvoiceEmail };
