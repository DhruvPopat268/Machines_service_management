const jwt = require("jsonwebtoken");
const AdminUser = require("../modules/admin/auth/admin.user.model");
const AdminUserSession = require("../modules/admin/auth/admin.user.session.model");

const adminAuthMiddleware = async (req, res, next) => {
  try {
    const token =
      process.env.NODE_ENV === "development" && req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : req.cookies?.AdminToken;
    if (!token)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);

    const session = await AdminUserSession.findOne({ token, userId: decoded.id });
    if (!session)
      return res.status(401).json({ success: false, message: "Session expired or invalid" });

    const user = await AdminUser.findById(decoded.id).select("role status lastActivityAt");
    if (!user)
      return res.status(401).json({ success: false, message: "User not found" });
    if (user.status === "Inactive")
      return res.status(403).json({ success: false, message: "Account is inactive" });
    if (user.role === "Engineer")
      return res.status(403).json({ success: false, message: "Access denied" });

    await AdminUser.findByIdAndUpdate(decoded.id, { lastActivityAt: new Date() });

    req.adminUser = { ...decoded, role: user.role };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
};

module.exports = adminAuthMiddleware;
