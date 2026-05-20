const SoldMachine = require("../../admin/soldMachines/admin.soldMachine.model");
const Machine = require("../../admin/inventoryManagement/admin.machine.model");
const { utcToZonedTime } = require("date-fns-tz");

const getOwnedMachines = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const soldRecords = await SoldMachine.find({
      "customerInfo.customerId": customerId
    });

    if (soldRecords.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          customerInfo: null,
          machines: []
        },
        pagination: {
          total: 0,
          page,
          limit,
          totalPages: 0
        }
      });
    }

    const customerInfo = soldRecords[0].customerInfo;
    
    // Get current date in IST (UTC + 5:30)
    const currentDateIST = utcToZonedTime(new Date(), 'Asia/Kolkata');

    // Collect all unique machineIds
    const machineIds = [...new Set(
      soldRecords.flatMap(record => 
        record.machines.map(machine => machine.machineId).filter(id => id)
      )
    )];

    // Fetch all machines with images
    const machines = await Machine.find({ _id: { $in: machineIds } }).select("_id images");
    const machineImagesMap = new Map(machines.map(m => [m._id.toString(), m.images]));

    const allVariants = soldRecords.flatMap(record => 
      record.machines.flatMap(machine => 
        machine.variants.map(variant => {
          const contractType = variant.contractType.toObject();
          
          // Convert validTo to IST for comparison
          const validToIST = utcToZonedTime(contractType.validTo, 'Asia/Kolkata');
          contractType.isContractExpired = validToIST < currentDateIST;
          
          return {
            machineId: machine.machineId,
            machineName: machine.machineName,
            modelNumber: machine.modelNumber,
            categoryId: machine.categoryId,
            category: machine.category,
            divisionId: machine.divisionId,
            division: machine.division,
            images: machine.machineId ? machineImagesMap.get(machine.machineId.toString()) || [] : [],
            variant: {
              ...variant.toObject(),
              contractType
            },
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
          };
        })
      )
    );

    const total = allVariants.length;
    const paginatedVariants = allVariants.slice(skip, skip + limit);

    return res.status(200).json({
      success: true,
      data: {
        customerInfo,
        machines: paginatedVariants
      },
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching owned machines:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch owned machines"
    });
  }
};

const getVariantDetail = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { variantId } = req.params;

    const soldRecord = await SoldMachine.findOne({
      "customerInfo.customerId": customerId,
      "machines.variants._id": variantId
    });

    if (!soldRecord) {
      return res.status(404).json({
        success: false,
        message: "Variant not found"
      });
    }

    let variantDetail = null;
    let machineDetail = null;
    
    // Get current date in IST (UTC + 5:30)
    const currentDateIST = utcToZonedTime(new Date(), 'Asia/Kolkata');

    for (const machine of soldRecord.machines) {
      const variant = machine.variants.find(v => v._id.toString() === variantId);
      if (variant) {
        const variantObj = variant.toObject();
        const contractType = variantObj.contractType;
        
        // Convert validTo to IST for comparison
        const validToIST = utcToZonedTime(contractType.validTo, 'Asia/Kolkata');
        contractType.isContractExpired = validToIST < currentDateIST;
        
        variantDetail = {
          ...variantObj,
          contractType
        };
        
        // Fetch machine images
        let images = [];
        if (machine.machineId) {
          const machineDoc = await Machine.findById(machine.machineId).select("images");
          images = machineDoc?.images || [];
        }
        
        machineDetail = {
          machineId: machine.machineId,
          machineName: machine.machineName,
          modelNumber: machine.modelNumber,
          categoryId: machine.categoryId,
          category: machine.category,
          divisionId: machine.divisionId,
          division: machine.division,
          images
        };
        break;
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        customerInfo: soldRecord.customerInfo,
        machine: machineDetail,
        variant: variantDetail,
        createdAt: soldRecord.createdAt,
        updatedAt: soldRecord.updatedAt
      }
    });
  } catch (error) {
    console.error("Error fetching variant detail:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch variant detail"
    });
  }
};

module.exports = { getOwnedMachines, getVariantDetail };
