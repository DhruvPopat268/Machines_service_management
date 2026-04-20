const jwt = require("jsonwebtoken");
const AdminUser = require("../auth/admin.user.model");
const AdminUserSession = require("../auth/admin.user.session.model");

const adminAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.cookies?.AdminToken;
    if (!token)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const session = await AdminUserSession.findOne({ token, userId: decoded.id });
    if (!session)
      return res.status(401).json({ success: false, message: "Session expired or invalid" });

    await AdminUser.findByIdAndUpdate(decoded.id, { lastActivityAt: new Date() });

    req.adminUser = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
};

module.exports = adminAuthMiddleware;
