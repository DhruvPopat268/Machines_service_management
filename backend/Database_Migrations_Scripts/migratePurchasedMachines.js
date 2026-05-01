require("dotenv").config();
const mongoose = require("mongoose");
const PurchasedMachine = require("../modules/admin/purchasedMachines/admin.purchasedMachine.model");
const MachineCategory = require("../modules/admin/machineCategoryManagement/admin.machineCategory.model");
const MachineDivision = require("../modules/admin/machineDivisionManagement/admin.machineDivision.model");

const migratePurchasedMachines = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/your_database_name");
    console.log("Connected to MongoDB");

    // Fetch all purchased machines
    const purchases = await PurchasedMachine.find({});
    console.log(`Found ${purchases.length} purchase records to process`);

    // Fetch all categories and divisions for lookup
    const categories = await MachineCategory.find({});
    const divisions = await MachineDivision.find({});

    // Create lookup maps (case-insensitive)
    const categoryMap = new Map();
    categories.forEach(cat => {
      categoryMap.set(cat.name.toLowerCase().trim(), cat._id);
    });

    const divisionMap = new Map();
    divisions.forEach(div => {
      divisionMap.set(div.name.toLowerCase().trim(), div._id);
    });

    console.log(`Loaded ${categoryMap.size} categories, ${divisionMap.size} divisions`);

    let updatedCount = 0;
    let skippedCount = 0;

    // Process each purchase
    for (const purchase of purchases) {
      let needsUpdate = false;
      
      // Process each machine entry in the purchase
      for (let i = 0; i < purchase.machines.length; i++) {
        const machineEntry = purchase.machines[i];
        
        // Find and set categoryId
        if (!machineEntry.categoryId && machineEntry.category) {
          const categoryId = categoryMap.get(machineEntry.category.toLowerCase().trim());
          if (categoryId) {
            purchase.machines[i].categoryId = categoryId;
            needsUpdate = true;
          } else {
            console.log(`Warning: Category "${machineEntry.category}" not found in purchase ${purchase._id}`);
          }
        }

        // Find and set divisionId
        if (!machineEntry.divisionId && machineEntry.division) {
          const divisionId = divisionMap.get(machineEntry.division.toLowerCase().trim());
          if (divisionId) {
            purchase.machines[i].divisionId = divisionId;
            needsUpdate = true;
          } else {
            console.log(`Warning: Division "${machineEntry.division}" not found in purchase ${purchase._id}`);
          }
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
    console.log(`Skipped (already had IDs): ${skippedCount}`);

    await mongoose.connection.close();
    console.log("Database connection closed");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
};

// Run migration
migratePurchasedMachines();
