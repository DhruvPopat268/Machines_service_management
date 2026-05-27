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

const processImages = async (files) => {
  const urls = [];
  for (const file of files) {
    const filename = `servicecall_${Date.now()}_${Math.random().toString(36).slice(2)}.webp`;
    const url = await uploadToServer(file.buffer, filename);
    urls.push(url);
  }
  return urls;
};

const raiseServiceCall = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { serviceCalls, customerLocation } = req.body;

    let parsedServiceCalls;
    try {
      parsedServiceCalls = typeof serviceCalls === "string" ? JSON.parse(serviceCalls) : serviceCalls;
    } catch (_) {
      return res.status(400).json({
        success: false,
        message: "Invalid serviceCalls format"
      });
    }

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
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found or inactive"
      });
    }

    const variantIds = parsedServiceCalls.map(sc => sc.variantId);
    const soldRecords = await SoldMachine.find({
      "customerInfo.customerId": customerId,
      "machines.variants._id": { $in: variantIds }
    });

    if (soldRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No machines found for the provided variant IDs"
      });
    }

    const allProblemTypeIds = parsedServiceCalls
      .flatMap(sc => (Array.isArray(sc.problemTypeIds) ? sc.problemTypeIds : sc.problemTypeId ? [sc.problemTypeId] : []))
      .filter(Boolean);

    const problemTypes = allProblemTypeIds.length > 0
      ? await ProblemType.find({ _id: { $in: allProblemTypeIds } })
      : [];
    const problemTypeMap = new Map(problemTypes.map(pt => [pt._id.toString(), pt]));

    // Process uploaded images for each variant
    // Images are uploaded with field names like: images_0, images_1, images_2, etc.
    // where the number corresponds to the index in serviceCalls array
    const variantImagesMap = new Map();
    
    if (req.files && req.files.length > 0) {
      // Group files by variant index from fieldname
      const filesByVariant = {};
      for (const file of req.files) {
        const match = file.fieldname.match(/^images_(\d+)$/);
        if (match) {
          const variantIndex = parseInt(match[1]);
          if (!filesByVariant[variantIndex]) {
            filesByVariant[variantIndex] = [];
          }
          filesByVariant[variantIndex].push(file);
        }
      }

      // Process images for each variant
      for (const [variantIndex, files] of Object.entries(filesByVariant)) {
        try {
          const uploadedUrls = await processImages(files);
          variantImagesMap.set(parseInt(variantIndex), uploadedUrls);
        } catch (imgErr) {
          return res.status(400).json({
            success: false,
            message: `Image upload failed for variant ${variantIndex}: ${imgErr.message}`
          });
        }
      }
    }

    const machines = [];
    for (let i = 0; i < parsedServiceCalls.length; i++) {
      const serviceCall = parsedServiceCalls[i];
      let found = false;
      
      for (const record of soldRecords) {
        for (const machine of record.machines) {
          const variant = machine.variants.find(v => v._id.toString() === serviceCall.variantId);
          if (variant) {
            const scProblemTypeIds = Array.isArray(serviceCall.problemTypeIds)
              ? serviceCall.problemTypeIds
              : serviceCall.problemTypeId ? [serviceCall.problemTypeId] : [];

            for (const ptId of scProblemTypeIds) {
              if (!problemTypeMap.has(ptId)) {
                return res.status(404).json({
                  success: false,
                  message: `Problem type not found for ID: ${ptId}`
                });
              }
            }

            const variantImages = variantImagesMap.get(i) || [];

            machines.push({
              variantId: variant._id,
              machineId: machine.machineId,
              machineName: machine.machineName,
              modelNumber: machine.modelNumber,
              serialNumber: variant.name,
              divisionId: machine.divisionId,
              division: machine.division,
              categoryId: machine.categoryId,
              category: machine.category,
              attributeName: variant.name,
              attributeValue: variant.value,
              contractType: variant.contractType,
              issueDescription: serviceCall.issueDescription,
              problemTypeIds: scProblemTypeIds,
              problemTypes: scProblemTypeIds.map(id => problemTypeMap.get(id).name),
              images: variantImages
            });
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }

    if (machines.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No valid machine variants found"
      });
    }

    // Generate callId
    const lastCall = await ServiceCall.findOne().sort({ createdAt: -1 }).select("callId");
    let callNumber = 1;
    if (lastCall && lastCall.callId) {
      const match = lastCall.callId.match(/^SC-(\d+)$/);
      if (match) {
        callNumber = parseInt(match[1]) + 1;
      }
    }
    const callId = `SC-${callNumber}`;

    const serviceCallDoc = new ServiceCall({
      callId,
      customerInfo: {
        customerId: customer._id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address || customer.userLocation?.address || "",
        zone: customer.zone?.name || "",
        gstNumber: customer.gstNumber || "",
        ...(parsedCustomerLocation && {
          location: {
            address:   parsedCustomerLocation.address,
            latitude:  parsedCustomerLocation.latitude,
            longitude: parsedCustomerLocation.longitude,
          }
        })
      },
      machines
    });

    await serviceCallDoc.save();

    return res.status(201).json({
      success: true,
      message: "Service call raised successfully",
      data: serviceCallDoc
    });
  } catch (error) {
    console.error("Error raising service call:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to raise service call"
    });
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

    return res.status(200).json({
      success: true,
      data: activeCalls
    });
  } catch (error) {
    console.error("Error fetching active calls:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch active calls"
    });
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

    return res.status(200).json({
      success: true,
      data: completedCalls
    });
  } catch (error) {
    console.error("Error fetching completed calls:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch completed calls"
    });
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

    return res.status(200).json({
      success: true,
      data: cancelledCalls
    });
  } catch (error) {
    console.error("Error fetching cancelled calls:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch cancelled calls"
    });
  }
};

const getCallDetail = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { id } = req.params;

    const serviceCall = await ServiceCall.findOne({
      _id: id,
      "customerInfo.customerId": customerId
    });

    if (!serviceCall) {
      return res.status(404).json({
        success: false,
        message: "Service call not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: serviceCall
    });
  } catch (error) {
    console.error("Error fetching call detail:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch call detail"
    });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { toZonedTime } = require("date-fns-tz");
    const currentDateIST = toZonedTime(new Date(), "Asia/Kolkata");

    const soldRecords = await SoldMachine.find({ "customerInfo.customerId": customerId });

    // Flatten all variants
    const allVariants = soldRecords.flatMap(record =>
      record.machines.flatMap(machine =>
        machine.variants.map(variant => ({
          machineId: machine.machineId,
          machineName: machine.machineName,
          modelNumber: machine.modelNumber,
          category: machine.category,
          division: machine.division,
          variant: variant.toObject()
        }))
      )
    );

    const expiredVariants = allVariants.filter(v => {
      const validToIST = toZonedTime(v.variant.contractType.validTo, "Asia/Kolkata");
      return validToIST < currentDateIST;
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
        .limit(5)
    ]);

    return res.status(200).json({
      success: true,
      data: {
        stats: {
          totalOwnedMachines: allVariants.length,
          expiredContractMachines: expiredVariants.length,
          totalRaisedCalls,
          totalCompletedCalls
        },
        expiredContractMachines: expiredVariants.slice(0, 5),
        activeCalls
      }
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard stats"
    });
  }
};

module.exports = { raiseServiceCall, getActiveCalls, getCompletedCalls, getCancelledCalls, getCallDetail, getDashboardStats };
