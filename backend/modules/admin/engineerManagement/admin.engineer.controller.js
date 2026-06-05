const AdminUser = require("../auth/admin.user.model");

const getEngineers = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;

    const query = { role: "Engineer" };

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { name:       { $regex: escaped, $options: "i" } },
          { email:      { $regex: escaped, $options: "i" } },
          { phone:      { $regex: escaped, $options: "i" } },
          { engineerId: { $regex: escaped, $options: "i" } },
        ];
      }
    }

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [engineers, total] = await Promise.all([
      AdminUser.find(query)
        .select("_id name email phone engineerId profilePhoto engineerLocation isOnline status lastLoginAt createdAt updatedAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      AdminUser.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: engineers,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getActiveEngineers = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;

    const query = { role: "Engineer", status: "Active" };

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { name:       { $regex: escaped, $options: "i" } },
          { email:      { $regex: escaped, $options: "i" } },
          { phone:      { $regex: escaped, $options: "i" } },
          { engineerId: { $regex: escaped, $options: "i" } },
        ];
      }
    }

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [engineers, total] = await Promise.all([
      AdminUser.find(query)
        .select("_id name email phone engineerId profilePhoto engineerLocation isOnline status lastLoginAt createdAt updatedAt isOnline")
        .sort({ name: 1 })
        .skip(skip)
        .limit(limitNum),
      AdminUser.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: engineers,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getEngineers, getActiveEngineers };
