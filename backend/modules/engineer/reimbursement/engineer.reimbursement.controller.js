const TravelReimbursement = require("./engineer.reimbursement.model");
const mongoose = require("mongoose");

const getMyReimbursements = async (req, res) => {
  try {
    const engineerId = req.engineer.id;
    const { fromDate, toDate, page = 1, limit = 20 } = req.body || {};

    const query = { "engineerInfo._id": new mongoose.Types.ObjectId(engineerId) };

    const parseDate = (str) => {
      if (!str) return null;
      const [dd, mm, yy] = str.split("/");
      if (!dd || !mm || !yy) return null;
      const year = parseInt(yy) + 2000;
      return new Date(year, parseInt(mm) - 1, parseInt(dd));
    };

    if (fromDate || toDate) {
      query.travelDate = {};
      if (fromDate) {
        const from = parseDate(fromDate);
        if (!from) return res.status(400).json({ success: false, message: "Invalid fromDate format. Use dd/mm/yy" });
        from.setHours(0, 0, 0, 0);
        query.travelDate.$gte = from;
      }
      if (toDate) {
        const to = parseDate(toDate);
        if (!to) return res.status(400).json({ success: false, message: "Invalid toDate format. Use dd/mm/yy" });
        to.setHours(23, 59, 59, 999);
        query.travelDate.$lte = to;
      }
    }

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [records, total, stats] = await Promise.all([
      TravelReimbursement.find(query)
        .populate("callId", "callId")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      TravelReimbursement.countDocuments(query),
      TravelReimbursement.aggregate([
        { $match: query },
        { $group: {
          _id: "$status",
          totalKm: { $sum: "$travelledKm" },
          count:   { $sum: 1 },
        }},
      ]),
    ]);

    const pendingStat = stats.find(s => s._id === "Pending") || { totalKm: 0, count: 0 };
    const paidStat    = stats.find(s => s._id === "Paid")    || { totalKm: 0, count: 0 };

    return res.status(200).json({
      success: true,
      data: records,
      stats: {
        totalPendingKm:    Math.round(pendingStat.totalKm * 100) / 100,
        totalPendingCount: pendingStat.count,
        totalPaidKm:       Math.round(paidStat.totalKm * 100) / 100,
        totalPaidCount:    paidStat.count,
      },
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getMyReimbursements };
