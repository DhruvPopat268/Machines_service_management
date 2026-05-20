const jwt = require("jsonwebtoken");
const Customer = require("../modules/admin/customerManagement/admin.customer.model");
const CustomerSession = require("../modules/customer/auth/customer.session.model");

const customerAuthMiddleware = async (req, res, next) => {
  try {
    const token =
      process.env.NODE_ENV === "development" && req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : req.cookies?.CustomerToken;
    if (!token)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const decoded = jwt.verify(token, process.env.CUSTOMER_JWT_SECRET);

    const session = await CustomerSession.findOne({ token, customerId: decoded.id });
    if (!session)
      return res.status(401).json({ success: false, message: "Session expired or invalid" });

    const customer = await Customer.findById(decoded.id);
    if (!customer || customer.status === "Inactive")
      return res.status(401).json({ success: false, message: "Unauthorized" });

    req.customer = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
};

module.exports = customerAuthMiddleware;
