require("dotenv").config();
const mongoose = require("mongoose");
const SoldMachine = require("../modules/admin/soldMachines/admin.soldMachine.model");
const Machine = require("../modules/admin/inventoryManagement/admin.machine.model");
const MachineCategory = require("../modules/admin/machineCategoryManagement/admin.machineCategory.model");

const addModelNumberToSoldMachines = async () => {
  // Validate MONGO_URI is set
  if (!process.env.MONGO_URI) {
    console.error("Error: MONGO_URI environment variable is not set");
    console.error("Please set MONGO_URI before running this migration");
    console.error("Example: MONGO_URI=\"mongodb://localhost:27017/your_db\" node addModelNumberToSoldMachines.js");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Default division IDs to assign randomly if division is missing
    const defaultDivisionIds = [
      new mongoose.Types.ObjectId("69e8ac5ec7c38becf9605bcd"),
      new mongoose.Types.ObjectId("69e8ac69c7c38becf9605bce")
    ];

    // Fetch all sold machines
    const sales = await SoldMachine.find({});
    console.log(`Found ${sales.length} sale records to process`);

    // Fetch all machines for lookup
    const machines = await Machine.find({}).populate("category").populate("division");
    
    // Create lookup map by machineId
    const machineMap = new Map();
    machines.forEach(machine => {
      machineMap.set(machine._id.toString(), machine);
    });

    // Fetch all categories for lookup by name
    const categories = await MachineCategory.find({});
    const categoryMap = new Map();
    categories.forEach(cat => {
      categoryMap.set(cat.name.toLowerCase().trim(), cat._id);
    });

    console.log(`Loaded ${machineMap.size} machines for lookup`);
    console.log(`Loaded ${categoryMap.size} categories for lookup`);

    let updatedCount = 0;
    let skippedCount = 0;

    // Process each sale
    for (const sale of sales) {
      let needsUpdate = false;
      
      // Process each machine entry in the sale
      for (let i = 0; i < sale.machines.length; i++) {
        const machineEntry = sale.machines[i];
        
        // Skip if all fields already exist
        if (machineEntry.modelNumber && machineEntry.categoryId && machineEntry.divisionId) {
          continue;
        }

        // Try to get data from Machine collection using machineId
        if (machineEntry.machineId) {
          const machine = machineMap.get(machineEntry.machineId.toString());
          if (machine) {
            // Add modelNumber if missing
            if (!machineEntry.modelNumber && machine.modelNumber) {
              sale.machines[i].modelNumber = machine.modelNumber;
              needsUpdate = true;
            }
            
            // Add categoryId if missing
            if (!machineEntry.categoryId && machine.category) {
              sale.machines[i].categoryId = machine.category._id;
              needsUpdate = true;
            }
            
            // Add divisionId if missing
            if (!machineEntry.divisionId) {
              if (machine.division) {
                // Use division from machine if available
                sale.machines[i].divisionId = machine.division._id;
                needsUpdate = true;
              } else {
                // Assign random division from default list
                const randomDivisionId = defaultDivisionIds[Math.floor(Math.random() * defaultDivisionIds.length)];
                sale.machines[i].divisionId = randomDivisionId;
                needsUpdate = true;
                console.log(`Assigned random division to machine "${machineEntry.machineName}" in sale ${sale._id}`);
              }
            }
            
            if (needsUpdate) {
              console.log(`Updated machine "${machineEntry.machineName}" in sale ${sale._id}`);
            }
          } else {
            console.log(`Warning: Machine with ID "${machineEntry.machineId}" not found in sale ${sale._id}`);
            
            // Even if machine not found, try to populate missing fields
            // Add categoryId from category name if missing
            if (!machineEntry.categoryId && machineEntry.category) {
              const categoryId = categoryMap.get(machineEntry.category.toLowerCase().trim());
              if (categoryId) {
                sale.machines[i].categoryId = categoryId;
                needsUpdate = true;
              }
            }
            
            // Add random divisionId if missing
            if (!machineEntry.divisionId) {
              const randomDivisionId = defaultDivisionIds[Math.floor(Math.random() * defaultDivisionIds.length)];
              sale.machines[i].divisionId = randomDivisionId;
              needsUpdate = true;
              console.log(`Assigned random division to machine "${machineEntry.machineName}" (machine not found) in sale ${sale._id}`);
            }
          }
        } else {
          console.log(`Warning: Machine entry "${machineEntry.machineName}" has no machineId in sale ${sale._id}`);
          
          // Try to populate categoryId from category name
          if (!machineEntry.categoryId && machineEntry.category) {
            const categoryId = categoryMap.get(machineEntry.category.toLowerCase().trim());
            if (categoryId) {
              sale.machines[i].categoryId = categoryId;
              needsUpdate = true;
            }
          }
          
          // Assign random divisionId if missing
          if (!machineEntry.divisionId) {
            const randomDivisionId = defaultDivisionIds[Math.floor(Math.random() * defaultDivisionIds.length)];
            sale.machines[i].divisionId = randomDivisionId;
            needsUpdate = true;
            console.log(`Assigned random division to machine "${machineEntry.machineName}" (no machineId) in sale ${sale._id}`);
          }
        }
      }

      // Save if any updates were made
      if (needsUpdate) {
        await sale.save();
        updatedCount++;
        if (updatedCount % 100 === 0) {
          console.log(`Processed ${updatedCount} sales...`);
        }
      } else {
        skippedCount++;
      }
    }

    console.log("\n=== Migration Complete ===");
    console.log(`Total sales: ${sales.length}`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped (already had all fields): ${skippedCount}`);

    await mongoose.connection.close();
    console.log("Database connection closed");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
};

// Run migration
addModelNumberToSoldMachines();
