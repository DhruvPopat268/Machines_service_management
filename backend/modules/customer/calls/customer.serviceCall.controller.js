const ServiceCall = require("./customer.serviceCall.model");
const SoldMachine = require("../../admin/soldMachines/admin.soldMachine.model");
const Customer = require("../../admin/customerManagement/admin.customer.model");
const ProblemType = require("../../admin/problemTypeManagement/admin.problemType.model");
const path = require("path");
const fs = require("fs/promises");
const sharp = require("sharp");

const IMAGES_DIR = process.env.NODE_ENV === "production"
  ? "/app/cloud/images/service-calls"
  : path.join(__dirname, "../../../cloud/images/service-calls");

const createdDirs = new Set();

const uploadToServer = async (fileBuffer, filename) => {
  if (!createdDirs.has(IMAGES_DIR)) {
    await fs.mkdir(IMAGES_DIR, { recursive: true });
    createdDirs.add(IMAGES_DIR);
  }
  await sharp(fileBuffer)
    .resize({ width: 800, withoutEnlargement: true })
    .webp({ quality: 70, effort: 1, smartSubsample: true })
    .toFile(path.join(IMAGES_DIR, filename));
  return `${process.env.BACKEND_URL}/app/cloud/images/service-calls/${filename}`;
};

const raiseServiceCall = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { serviceCalls, customerLocation, callType } = req.body;

    const validCallTypes = ["Service-Call", "Installation", "Deinstallation", "Counter-Reading", "Others"];
    if (callType && !validCallTypes.includes(callType))
      return res.status(400).json({ success: false, message: "Invalid callType" });

    let parsedServiceCalls;
    try {
      parsedServiceCalls = typeof serviceCalls === "string" ? JSON.parse(serviceCalls) : serviceCalls;
    } catch (_) {
      return res.status(400).json({ success: false, message: "Invalid serviceCalls format" });
    }

    if (!Array.isArray(parsedServiceCalls) || parsedServiceCalls.length === 0)
      return res.status(400).json({ success: false, message: "serviceCalls must be a non-empty array" });

    let parsedCustomerLocation;
    if (customerLocation) {
      try {
        parsedCustomerLocation = typeof customerLocation === "string" ? JSON.parse(customerLocation) : customerLocation;
      } catch (_) {
        return res.status(400).json({ success: false, message: "Invalid customerLocation format" });
      }
      const { address: locAddr, latitude: lat, longitude: lng } = parsedCustomerLocation;
      if (!locAddr || typeof locAddr !== "string" || !locAddr.trim())
        return res.status(400).json({ success: false, message: "customerLocation.address must be a non-empty string" });
      if (!Number.isFinite(lat) || lat < -90 || lat > 90)
        return res.status(400).json({ success: false, message: "customerLocation.latitude must be a number between -90 and 90" });
      if (!Number.isFinite(lng) || lng < -180 || lng > 180)
        return res.status(400).json({ success: false, message: "customerLocation.longitude must be a number between -180 and 180" });
    }

    const customer = await Customer.findOne({ _id: customerId, status: "Active" }).populate("zone");
    if (!customer)
      return res.status(404).json({ success: false, message: "Customer not found or inactive" });

    const serialNumbers = parsedServiceCalls.map(sc => sc.serialNumber?.trim()).filter(Boolean);
    const soldRecords = await SoldMachine.find({
      "customerInfo.customerId": customerId,
      "machines.serialNumbers.serialNumber": { $in: serialNumbers },
    });

    if (soldRecords.length === 0)
      return res.status(404).json({ success: false, message: "No machines found for the provided serial numbers" });

    const allProblemTypeIds = parsedServiceCalls
      .flatMap(sc => Array.isArray(sc.problemTypeIds) ? sc.problemTypeIds : [])
      .filter(Boolean);
    const problemTypes = allProblemTypeIds.length > 0
      ? await ProblemType.find({ _id: { $in: allProblemTypeIds } })
      : [];
    const problemTypeMap = new Map(problemTypes.map(pt => [pt._id.toString(), pt.name]));

    // Group uploaded files by index (field names: images_0, images_1, ...)
    const filesByIndex = {};
    for (const file of (req.files || [])) {
      const match = file.fieldname.match(/^images_(\d+)$/);
      if (match) {
        const idx = parseInt(match[1]);
        (filesByIndex[idx] = filesByIndex[idx] || []).push(file);
      }
    }

    const machines = [];
    for (let i = 0; i < parsedServiceCalls.length; i++) {
      const sc = parsedServiceCalls[i];
      const sn = sc.serialNumber?.trim();

      if (!sn)
        return res.status(400).json({ success: false, message: `serialNumber is required at index ${i}` });
      if (!sc.issueDescription?.trim())
        return res.status(400).json({ success: false, message: `issueDescription is required at index ${i}` });

      let foundMachine = null;
      let foundEntry = null;
      outer: for (const record of soldRecords) {
        for (const machine of record.machines) {
          const entry = (machine.serialNumbers || []).find(e => e.serialNumber === sn);
          if (entry) {
            foundMachine = machine;
            foundEntry = entry;
            break outer;
          }
        }
      }

      if (!foundMachine)
        return res.status(404).json({ success: false, message: `Serial number "${sn}" not found in your sold machines` });

      if (foundEntry.contractType?.validTo && new Date(foundEntry.contractType.validTo) < new Date())
        return res.status(400).json({ success: false, message: `Serial number "${sn}" has an expired contract` });

      if (!foundEntry.contractType?.freeService)
        return res.status(400).json({ success: false, message: `Serial number "${sn}" does not have a free service contract. Please contact support.` });

      const ptIds = Array.isArray(sc.problemTypeIds) ? sc.problemTypeIds : [];
      for (const ptId of ptIds) {
        if (!problemTypeMap.has(ptId))
          return res.status(404).json({ success: false, message: `Problem type not found for ID: ${ptId}` });
      }

      const images = [];
      for (const file of (filesByIndex[i] || [])) {
        const filename = `servicecall_${Date.now()}_${Math.random().toString(36).slice(2)}.webp`;
        images.push(await uploadToServer(file.buffer, filename));
      }

      machines.push({
        machineId:        foundMachine.machineId,
        machineName:      foundMachine.machineName,
        modelNumber:      foundMachine.modelNumber,
        serialNumber:     sn,
        divisionId:       foundMachine.divisionId,
        division:         foundMachine.division,
        categoryId:       foundMachine.categoryId,
        category:         foundMachine.category,
        contractType:     foundEntry.contractType,
        issueDescription: sc.issueDescription.trim(),
        problemTypeIds:   ptIds,
        problemTypes:     ptIds.map(id => problemTypeMap.get(id)),
        images,
        serviceCharge:    0,
      });
    }

    if (machines.length === 0)
      return res.status(404).json({ success: false, message: "No valid machines found" });

    const lastCall = await ServiceCall.findOne().sort({ createdAt: -1 }).select("callId");
    let callNumber = 1;
    if (lastCall?.callId) {
      const match = lastCall.callId.match(/^SC-(\d+)$/);
      if (match) callNumber = parseInt(match[1]) + 1;
    }

    const customerAddress = customer.userLocation?.address || parsedCustomerLocation?.address;
    if (!customerAddress)
      return res.status(400).json({ success: false, message: "Customer address is not set." });

    const serviceCallDoc = new ServiceCall({
      callId: `SC-${callNumber}`,
      customerInfo: {
        customerId: customer._id,
        name:       customer.name,
        phone:      customer.phone,
        email:      customer.email,
        address:    customerAddress,
        zone:       customer.zone?.name || "",
        gstNumber:  customer.gstNumber || "",
        ...(parsedCustomerLocation && {
          location: {
            address:   parsedCustomerLocation.address,
            latitude:  parsedCustomerLocation.latitude,
            longitude: parsedCustomerLocation.longitude,
          }
        }),
      },
      machines,
      callType:            callType || "Service-Call",
      totalServiceCharges: 0,
    });

    await serviceCallDoc.save();
    return res.status(201).json({ success: true, message: "Service call raised successfully", data: serviceCallDoc });
  } catch (error) {
    console.error("Error raising service call:", error);
    return res.status(500).json({ success: false, message: "Failed to raise service call" });
  }
};

const getActiveCalls = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const activeCalls = await ServiceCall.find({
      "customerInfo.customerId": customerId,
      status: { $in: ["Open", "Assigned", "In Progress", "On Hold"] }
    })
      .select("callId customerInfo machines status priority engineerInfo dates createdAt updatedAt")
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: activeCalls });
  } catch (error) {
    console.error("Error fetching active calls:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch active calls" });
  }
};

const getCompletedCalls = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const completedCalls = await ServiceCall.find({
      "customerInfo.customerId": customerId,
      status: "Completed"
    })
      .select("callId customerInfo machines status priority engineerInfo dates createdAt updatedAt")
      .sort({ "dates.completed": -1 });
    return res.status(200).json({ success: true, data: completedCalls });
  } catch (error) {
    console.error("Error fetching completed calls:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch completed calls" });
  }
};

const getCancelledCalls = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const cancelledCalls = await ServiceCall.find({
      "customerInfo.customerId": customerId,
      status: "Cancelled"
    })
      .select("callId customerInfo machines status priority engineerInfo dates createdAt updatedAt")
      .sort({ "dates.cancelled": -1 });
    return res.status(200).json({ success: true, data: cancelledCalls });
  } catch (error) {
    console.error("Error fetching cancelled calls:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch cancelled calls" });
  }
};

const getCallDetail = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { id } = req.params;
    const serviceCall = await ServiceCall.findOne({ _id: id, "customerInfo.customerId": customerId });
    if (!serviceCall)
      return res.status(404).json({ success: false, message: "Service call not found" });
    return res.status(200).json({ success: true, data: serviceCall });
  } catch (error) {
    console.error("Error fetching call detail:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch call detail" });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { toZonedTime } = require("date-fns-tz");
    const currentDateIST = toZonedTime(new Date(), "Asia/Kolkata");

    const soldRecords = await SoldMachine.find({ "customerInfo.customerId": customerId });

    const allMachines = soldRecords.flatMap(record =>
      record.machines.flatMap(machine =>
        (machine.serialNumbers || []).map(entry => ({
          machineId:    machine.machineId,
          machineName:  machine.machineName,
          modelNumber:  machine.modelNumber,
          category:     machine.category,
          division:     machine.division,
          serialNumber: entry.serialNumber,
          contractType: entry.contractType,
        }))
      )
    );

    const expiredMachines = allMachines.filter(m => {
      if (!m.contractType?.validTo) return false;
      return toZonedTime(m.contractType.validTo, "Asia/Kolkata") < currentDateIST;
    });

    const [totalRaisedCalls, totalCompletedCalls, activeCalls] = await Promise.all([
      ServiceCall.countDocuments({ "customerInfo.customerId": customerId }),
      ServiceCall.countDocuments({ "customerInfo.customerId": customerId, status: "Completed" }),
      ServiceCall.find({
        "customerInfo.customerId": customerId,
        status: { $in: ["Open", "Assigned", "In Progress", "On Hold"] }
      })
        .select("callId machines status priority engineerInfo dates createdAt updatedAt")
        .sort({ createdAt: -1 })
        .limit(5),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        stats: {
          totalOwnedMachines:      allMachines.length,
          expiredContractMachines: expiredMachines.length,
          totalRaisedCalls,
          totalCompletedCalls,
        },
        expiredContractMachines: expiredMachines.slice(0, 5),
        activeCalls,
      },
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch dashboard stats" });
  }
};

module.exports = { raiseServiceCall, getActiveCalls, getCompletedCalls, getCancelledCalls, getCallDetail, getDashboardStats };
