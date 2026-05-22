const ProblemType = require("../../admin/problemTypeManagement/admin.problemType.model");

const getActiveProblemTypes = async (req, res) => {
  try {
    const problemTypes = await ProblemType.find({ status: "Active" })
      .select("_id name description")
      .sort({ name: 1 });

    return res.status(200).json({
      success: true,
      data: problemTypes
    });
  } catch (error) {
    console.error("Error fetching problem types:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch problem types"
    });
  }
};

module.exports = { getActiveProblemTypes };
