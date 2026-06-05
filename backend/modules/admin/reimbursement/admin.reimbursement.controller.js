const TravelReimbursement = require("../../engineer/reimbursement/engineer.reimbursement.model");
const mongoose = require("mongoose");

const markAsPaid = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ success: false, message: "ids must be a non-empty array" });

    for (const id of ids) {
      if (!mongoose.isValidObjectId(id))
        return res.status(400).json({ success: false, message: `Invalid id: ${id}` });
    }

    const result = await TravelReimbursement.updateMany(
      { _id: { $in: ids }, status: "Pending" },
      { $set: { status: "Paid" } }
    );

    return res.status(200).json({ success: true, updatedCount: result.modifiedCount });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getReimbursements = async (req, res) => {
  try {
    const { engineerId, status, fromDate, toDate, page = 1, limit = 10 } = req.query;

    const query = {};

    if (engineerId) {
      if (!mongoose.isValidObjectId(engineerId))
        return res.status(400).json({ success: false, message: "Invalid engineerId" });
      query["engineerInfo._id"] = new mongoose.Types.ObjectId(engineerId);
    }

    if (status)  query.status  = status;
    if (req.query.purpose) query.purpose = req.query.purpose;

    if (fromDate || toDate) {
      query.travelDate = {};
      if (fromDate) query.travelDate.$gte = new Date(fromDate);
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        query.travelDate.$lte = to;
      }
    }

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [records, total] = await Promise.all([
      TravelReimbursement.find(query)
        .populate("callId", "callId")
        .sort({ createdAt: -1, _id: 1 })
        .skip(skip)
        .limit(limitNum),
      TravelReimbursement.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: records,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getReimbursements, markAsPaid };
