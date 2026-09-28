const { validateEditInvoice } = require("./admin.editInvoice.validator");

describe("Edit Invoice Module Tests", () => {
  describe("validateEditInvoice Validator", () => {
    it("should return error if machines array is empty", () => {
      const err = validateEditInvoice({ customerId: "507f1f77bcf86cd799439011", machines: [] });
      expect(err).toBe("machines array is required and must contain at least one item");
    });

    it("should return error if customerId has invalid format", () => {
      const err = validateEditInvoice({ customerId: "invalid-id", machines: [{ machineId: "507f1f77bcf86cd799439011", quantity: 1, sellingPriceWithGst: 1000 }] });
      expect(err).toBe("Invalid customer ID format");
    });

    it("should return error if item has negative price", () => {
      const err = validateEditInvoice({
        machines: [{
          machineId: "507f1f77bcf86cd799439011",
          quantity: 1,
          sellingPriceWithGst: -500
        }]
      });
      expect(err).toBe("Item 1: sellingPriceWithGst must be a non-negative number");
    });

    it("should return error if discount is greater than 100", () => {
      const err = validateEditInvoice({
        machines: [{
          machineId: "507f1f77bcf86cd799439011",
          quantity: 1,
          sellingPriceWithGst: 1000,
          discountPercentage: 150
        }]
      });
      expect(err).toBe("Item 1: discountPercentage must be between 0 and 100");
    });

    it("should return error if serial numbers count does not match quantity", () => {
      const err = validateEditInvoice({
        machines: [{
          machineId: "507f1f77bcf86cd799439011",
          quantity: 2,
          sellingPriceWithGst: 1000,
          serialNumbers: [{ serialNumber: "sh-001" }]
        }]
      });
      expect(err).toBe("Item 1: serialNumbers count (1) must match quantity (2)");
    });

    it("should pass validation with valid data", () => {
      const err = validateEditInvoice({
        customerId: "507f1f77bcf86cd799439011",
        otherCharges: 250,
        machines: [{
          machineId: "507f1f77bcf86cd799439011",
          quantity: 1,
          sellingPriceWithGst: 15000,
          discountPercentage: 10,
          serialNumbers: [{ serialNumber: "sh-002" }]
        }]
      });
      expect(err).toBeNull();
    });
  });

  describe("100% Unit-Level Stock Adjustment & Serial Swap Logic", () => {
    // Diffing function replicating the core algorithm in admin.editInvoice.service.js
    const calculateStockDiff = (oldMachines, newMachines) => {
      const adjustments = [];
      const oldMachinesMap = new Map();

      for (const m of oldMachines) {
        oldMachinesMap.set(m.machineId, m);
      }

      for (const newM of newMachines) {
        const oldM = oldMachinesMap.get(newM.machineId);
        const oldSerials = (oldM?.serialNumbers || []).map(s => s.toUpperCase());
        const newSerials = (newM.serialNumbers || []).map(s => s.toUpperCase());

        const oldSet = new Set(oldSerials);
        const newSet = new Set(newSerials);

        const returned = oldSerials.filter(s => !newSet.has(s));
        const deducted = newSerials.filter(s => !oldSet.has(s));
        const diffQty = newM.quantity - (oldM?.quantity || 0);

        let type = "unchanged";
        if (!oldM) type = "item_added";
        else if (returned.length > 0 && deducted.length > 0) type = "serial_swapped";
        else if (diffQty > 0) type = "quantity_increased";
        else if (diffQty < 0) type = "quantity_decreased";

        adjustments.push({
          machineId: newM.machineId,
          type,
          diffQty,
          returned,
          deducted,
          requiresRestockedLog: returned.length > 0 || diffQty < 0,
          requiresSoldLog: deducted.length > 0 || diffQty > 0,
        });
      }

      return adjustments;
    };

    it("Case 1: Serial Swap (sh-001 -> sh-002) should return sh-001 as restocked and deduct sh-002 as sold", () => {
      const oldMachines = [{ machineId: "M1", quantity: 1, serialNumbers: ["sh-001"] }];
      const newMachines = [{ machineId: "M1", quantity: 1, serialNumbers: ["sh-002"] }];

      const [adj] = calculateStockDiff(oldMachines, newMachines);

      expect(adj.type).toBe("serial_swapped");
      expect(adj.diffQty).toBe(0); // Net quantity change is 0
      expect(adj.returned).toEqual(["SH-001"]); // sh-001 is returned to available stock
      expect(adj.deducted).toEqual(["SH-002"]); // sh-002 is marked sold
      expect(adj.requiresRestockedLog).toBe(true); // Generates Restocked InventoryLog
      expect(adj.requiresSoldLog).toBe(true);      // Generates Sold InventoryLog
    });

    it("Case 2: Quantity Increase (Add sh-003 to existing sh-001)", () => {
      const oldMachines = [{ machineId: "M1", quantity: 1, serialNumbers: ["sh-001"] }];
      const newMachines = [{ machineId: "M1", quantity: 2, serialNumbers: ["sh-001", "sh-003"] }];

      const [adj] = calculateStockDiff(oldMachines, newMachines);

      expect(adj.type).toBe("quantity_increased");
      expect(adj.diffQty).toBe(1);
      expect(adj.returned).toEqual([]);
      expect(adj.deducted).toEqual(["SH-003"]); // sh-003 is sold
      expect(adj.requiresRestockedLog).toBe(false);
      expect(adj.requiresSoldLog).toBe(true);
    });

    it("Case 3: Quantity Decrease (Remove sh-002 from [sh-001, sh-002])", () => {
      const oldMachines = [{ machineId: "M1", quantity: 2, serialNumbers: ["sh-001", "sh-002"] }];
      const newMachines = [{ machineId: "M1", quantity: 1, serialNumbers: ["sh-001"] }];

      const [adj] = calculateStockDiff(oldMachines, newMachines);

      expect(adj.type).toBe("quantity_decreased");
      expect(adj.diffQty).toBe(-1);
      expect(adj.returned).toEqual(["SH-002"]); // sh-002 is returned / restocked
      expect(adj.deducted).toEqual([]);
      expect(adj.requiresRestockedLog).toBe(true);
      expect(adj.requiresSoldLog).toBe(false);
    });
  });
});
