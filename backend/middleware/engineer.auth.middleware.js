const jwt = require("jsonwebtoken");
const AdminUser = require("../modules/admin/auth/admin.user.model");
const EngineerSession = require("../modules/engineer/auth/engineer.session.model");

const engineerAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer "))
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.ENGINEER_JWT_SECRET);

    const session = await EngineerSession.findOne({ token, engineerId: decoded.id });
    if (!session)
      return res.status(401).json({ success: false, message: "Session expired or invalid" });

    const engineer = await AdminUser.findById(decoded.id);
    if (!engineer || engineer.status === "Inactive" || engineer.role !== "Engineer")
      return res.status(401).json({ success: false, message: "Unauthorized" });

    await AdminUser.findByIdAndUpdate(decoded.id, { lastActivityAt: new Date() });

    req.engineer = decoded;
    next();
  } catch (err) {
    console.error("Engineer auth error:", err);
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
};

module.exports = engineerAuthMiddleware;
