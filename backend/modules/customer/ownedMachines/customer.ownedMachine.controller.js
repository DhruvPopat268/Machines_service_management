const SoldMachine = require("../../admin/soldMachines/admin.soldMachine.model");
const Machine = require("../../admin/inventoryManagement/admin.machine.model");
const { toZonedTime } = require("date-fns-tz");

const getOwnedMachines = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const isAllRoute = req.path === "/all";
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip  = (page - 1) * limit;

    const soldRecords = await SoldMachine.find({ "customerInfo.customerId": customerId });

    if (soldRecords.length === 0) {
      return res.status(200).json({
        success: true,
        data: { customerInfo: null, machines: [] },
        ...(!isAllRoute && { pagination: { total: 0, page, limit, totalPages: 0 } }),
      });
    }

    const customerInfo = soldRecords[0].customerInfo;
    const currentDateIST = toZonedTime(new Date(), "Asia/Kolkata");

    const machineIds = [...new Set(
      soldRecords.flatMap(record => record.machines.map(m => m.machineId).filter(Boolean))
    )];

    const machineList = await Machine.find({ _id: { $in: machineIds } }).select("_id images");
    const machineImagesMap = new Map(machineList.map(m => [m._id.toString(), m.images]));

    const allMachines = soldRecords.flatMap(record =>
      record.machines.flatMap(machine =>
        (machine.serialNumbers || []).map(entry => {
          const contractType = entry.contractType ? { ...entry.contractType.toObject?.() ?? entry.contractType } : null;
          if (contractType?.validTo) {
            contractType.isContractExpired = toZonedTime(contractType.validTo, "Asia/Kolkata") < currentDateIST;
          }
          return {
            machineId:    machine.machineId,
            machineName:  machine.machineName,
            modelNumber:  machine.modelNumber,
            categoryId:   machine.categoryId,
            category:     machine.category,
            divisionId:   machine.divisionId,
            division:     machine.division,
            images:       machine.machineId ? machineImagesMap.get(machine.machineId.toString()) || [] : [],
            serialNumber: entry.serialNumber,
            contractType,
            createdAt:    record.createdAt,
            updatedAt:    record.updatedAt,
          };
        })
      )
    );

    const total         = allMachines.length;
    const resultMachines = isAllRoute ? allMachines : allMachines.slice(skip, skip + limit);

    return res.status(200).json({
      success: true,
      data: { customerInfo, machines: resultMachines },
      ...(!isAllRoute && { pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }),
    });
  } catch (error) {
    console.error("Error fetching owned machines:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch owned machines" });
  }
};

const getMachineDetail = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { serialNumber } = req.params;

    if (!serialNumber?.trim())
      return res.status(400).json({ success: false, message: "serialNumber is required" });

    const soldRecord = await SoldMachine.findOne({
      "customerInfo.customerId": customerId,
      "machines.serialNumbers.serialNumber": serialNumber.trim(),
    });

    if (!soldRecord)
      return res.status(404).json({ success: false, message: "Machine not found" });

    const currentDateIST = toZonedTime(new Date(), "Asia/Kolkata");
    let machineDetail = null;

    for (const machine of soldRecord.machines) {
      const entry = (machine.serialNumbers || []).find(e => e.serialNumber === serialNumber.trim());
      if (entry) {
        const contractType = entry.contractType ? { ...entry.contractType.toObject?.() ?? entry.contractType } : null;
        if (contractType?.validTo) {
          contractType.isContractExpired = toZonedTime(contractType.validTo, "Asia/Kolkata") < currentDateIST;
        }

        let images = [];
        if (machine.machineId) {
          const machineDoc = await Machine.findById(machine.machineId).select("images");
          images = machineDoc?.images || [];
        }

        machineDetail = {
          machineId:    machine.machineId,
          machineName:  machine.machineName,
          modelNumber:  machine.modelNumber,
          categoryId:   machine.categoryId,
          category:     machine.category,
          divisionId:   machine.divisionId,
          division:     machine.division,
          serialNumber: entry.serialNumber,
          contractType,
          images,
        };
        break;
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        customerInfo: soldRecord.customerInfo,
        machine:      machineDetail,
        createdAt:    soldRecord.createdAt,
        updatedAt:    soldRecord.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching machine detail:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch machine detail" });
  }
};

module.exports = { getOwnedMachines, getMachineDetail };
