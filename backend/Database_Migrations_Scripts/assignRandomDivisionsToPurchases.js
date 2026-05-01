require("dotenv").config();
const mongoose = require("mongoose");
const PurchasedMachine = require("../modules/admin/purchasedMachines/admin.purchasedMachine.model");
const MachineDivision = require("../modules/admin/machineDivisionManagement/admin.machineDivision.model");

const assignRandomDivisions = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/your_database_name");
    console.log("Connected to MongoDB");

    // The two division IDs to randomly assign
    const divisionIds = [
      new mongoose.Types.ObjectId("69e8ac5ec7c38becf9605bcd"),
      new mongoose.Types.ObjectId("69e8ac69c7c38becf9605bce")
    ];

    // Fetch the division documents to get their names
    const divisions = await MachineDivision.find({ _id: { $in: divisionIds } });
    
    if (divisions.length !== 2) {
      console.error("Error: Could not find both divisions in the database");
      process.exit(1);
    }

    console.log(`Found divisions: ${divisions.map(d => d.name).join(", ")}`);

    // Create a map for quick lookup
    const divisionMap = {};
    divisions.forEach(d => {
      divisionMap[d._id.toString()] = d.name;
    });

    // Fetch all purchased machines
    const purchases = await PurchasedMachine.find({});
    console.log(`Found ${purchases.length} purchase records to process`);

    let updatedCount = 0;
    let skippedCount = 0;
    let machinesUpdated = 0;

    // Process each purchase
    for (const purchase of purchases) {
      let needsUpdate = false;
      
      // Process each machine entry in the purchase
      for (let i = 0; i < purchase.machines.length; i++) {
        const machineEntry = purchase.machines[i];
        
        // Only update if divisionId is missing
        if (!machineEntry.divisionId) {
          // Randomly select one of the two division IDs
          const randomDivisionId = divisionIds[Math.floor(Math.random() * divisionIds.length)];
          const divisionName = divisionMap[randomDivisionId.toString()];
          
          purchase.machines[i].divisionId = randomDivisionId;
          purchase.machines[i].division = divisionName;
          needsUpdate = true;
          machinesUpdated++;
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
    console.log(`Updated purchases: ${updatedCount}`);
    console.log(`Skipped (already had divisions): ${skippedCount}`);
    console.log(`Total machines updated: ${machinesUpdated}`);

    await mongoose.connection.close();
    console.log("Database connection closed");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
};

// Run migration
assignRandomDivisions();
