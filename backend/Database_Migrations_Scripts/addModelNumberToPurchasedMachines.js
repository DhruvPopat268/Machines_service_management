require("dotenv").config();
const mongoose = require("mongoose");
const PurchasedMachine = require("../modules/admin/purchasedMachines/admin.purchasedMachine.model");
const Machine = require("../modules/admin/inventoryManagement/admin.machine.model");

const addModelNumberToPurchasedMachines = async () => {
  // Validate MONGO_URI is set
  if (!process.env.MONGO_URI) {
    console.error("Error: MONGO_URI environment variable is not set");
    console.error("Please set MONGO_URI before running this migration");
    console.error("Example: MONGO_URI=\"mongodb://localhost:27017/your_db\" node addModelNumberToPurchasedMachines.js");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Fetch all purchased machines
    const purchases = await PurchasedMachine.find({});
    console.log(`Found ${purchases.length} purchase records to process`);

    // Fetch all machines for lookup
    const machines = await Machine.find({});
    
    // Create lookup map by machineId
    const machineMap = new Map();
    machines.forEach(machine => {
      machineMap.set(machine._id.toString(), machine);
    });

    console.log(`Loaded ${machineMap.size} machines for lookup`);

    let updatedCount = 0;
    let skippedCount = 0;

    // Process each purchase
    for (const purchase of purchases) {
      let needsUpdate = false;
      
      // Process each machine entry in the purchase
      for (let i = 0; i < purchase.machines.length; i++) {
        const machineEntry = purchase.machines[i];
        
        // Skip if modelNumber already exists
        if (machineEntry.modelNumber) {
          continue;
        }

        // Try to get modelNumber from Machine collection using machineId
        if (machineEntry.machineId) {
          const machine = machineMap.get(machineEntry.machineId.toString());
          if (machine && machine.modelNumber) {
            purchase.machines[i].modelNumber = machine.modelNumber;
            needsUpdate = true;
            console.log(`Set modelNumber "${machine.modelNumber}" for machine "${machineEntry.machineName}" in purchase ${purchase._id}`);
          } else {
            console.log(`Warning: Machine with ID "${machineEntry.machineId}" not found or has no modelNumber in purchase ${purchase._id}`);
          }
        } else {
          console.log(`Warning: Machine entry "${machineEntry.machineName}" has no machineId in purchase ${purchase._id}`);
        }
      }

      // Save if any updates were made
      if (needsUpdate) {
        await purchase.save();
        updatedCount++;
        if (updatedCount % 100 === 0) {
          console.log(`Processed ${updatedCount} purchases...`);
        }
      } else {
        skippedCount++;
      }
    }

    console.log("\n=== Migration Complete ===");
    console.log(`Total purchases: ${purchases.length}`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped (already had modelNumber): ${skippedCount}`);

    await mongoose.connection.close();
    console.log("Database connection closed");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
};

// Run migration
addModelNumberToPurchasedMachines();
