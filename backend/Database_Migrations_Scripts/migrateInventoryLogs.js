require("dotenv").config();
const mongoose = require("mongoose");
const InventoryLog = require("./modules/admin/inventoryLogs/admin.inventoryLog.model");
const MachineCategory = require("./modules/admin/machineCategoryManagement/admin.machineCategory.model");
const MachineDivision = require("./modules/admin/machineDivisionManagement/admin.machineDivision.model");
const Machine = require("./modules/admin/inventoryManagement/admin.machine.model");

const migrateInventoryLogs = async () => {
  // Validate MONGO_URI is set
  if (!process.env.MONGO_URI) {
    console.error("Error: MONGO_URI environment variable is not set");
    console.error("Please set MONGO_URI before running this migration");
    console.error("Example: MONGO_URI=\"mongodb://localhost:27017/your_db\" node migrateInventoryLogs.js");
    process.exit(1);
  }

  console.log(process.env.MONGO_URI)
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Fetch all inventory logs
    const logs = await InventoryLog.find({});
    console.log(`Found ${logs.length} inventory logs to process`);

    // Fetch all categories, divisions, and machines for lookup
    const categories = await MachineCategory.find({});
    const divisions = await MachineDivision.find({});
    const machines = await Machine.find({});

    // Create lookup maps (case-insensitive)
    const categoryMap = new Map();
    categories.forEach(cat => {
      categoryMap.set(cat.name.toLowerCase().trim(), cat._id);
    });

    const divisionMap = new Map();
    divisions.forEach(div => {
      divisionMap.set(div.name.toLowerCase().trim(), div._id);
    });

    const machineMap = new Map();
    machines.forEach(machine => {
      machineMap.set(machine.name.toLowerCase().trim(), machine._id);
    });

    console.log(`Loaded ${categoryMap.size} categories, ${divisionMap.size} divisions, ${machineMap.size} machines`);

    let updatedCount = 0;
    let skippedCount = 0;

    // Process each log
    for (const log of logs) {
      let needsUpdate = false;
      
      // Process each machine entry in the log
      for (let i = 0; i < log.machines.length; i++) {
        const machineEntry = log.machines[i];
        
        // Find and set machineId
        if (!machineEntry.machineId && machineEntry.machineName) {
          const machineId = machineMap.get(machineEntry.machineName.toLowerCase().trim());
          if (machineId) {
            log.machines[i].machineId = machineId;
            needsUpdate = true;
          } else {
            console.log(`Warning: Machine "${machineEntry.machineName}" not found in log ${log._id}`);
          }
        }

        // Find and set categoryId
        if (!machineEntry.categoryId && machineEntry.category) {
          const categoryId = categoryMap.get(machineEntry.category.toLowerCase().trim());
          if (categoryId) {
            log.machines[i].categoryId = categoryId;
            needsUpdate = true;
          } else {
            console.log(`Warning: Category "${machineEntry.category}" not found in log ${log._id}`);
          }
        }

        // Find and set divisionId
        if (!machineEntry.divisionId && machineEntry.division) {
          const divisionId = divisionMap.get(machineEntry.division.toLowerCase().trim());
          if (divisionId) {
            log.machines[i].divisionId = divisionId;
            needsUpdate = true;
          } else {
            console.log(`Warning: Division "${machineEntry.division}" not found in log ${log._id}`);
          }
        }
      }

      // Save if any updates were made
      if (needsUpdate) {
        await log.save();
        updatedCount++;
        if (updatedCount % 100 === 0) {
          console.log(`Processed ${updatedCount} logs...`);
        }
      } else {
        skippedCount++;
      }
    }

    console.log("\n=== Migration Complete ===");
    console.log(`Total logs: ${logs.length}`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped (already had IDs): ${skippedCount}`);

    await mongoose.connection.close();
    console.log("Database connection closed");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
};

// Run migration
migrateInventoryLogs();
