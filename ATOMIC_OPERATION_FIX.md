# Atomic Operation Fix - Summary

## Issue Identified by CodeRabbit
Race condition vulnerability in stock management that could lead to negative inventory when multiple concurrent sales occur.

## Root Cause
The original code had a **Time-of-Check to Time-of-Use (TOCTOU)** race condition:
1. Stock check happened in JavaScript (early in the function)
2. Stock update happened later in a separate database query
3. Between check and update, another transaction could modify the stock
4. Result: Both transactions could pass the check but cause negative stock

## Files Updated

### 1. `/backend/modules/admin/soldMachines/admin.soldMachine.controller.js`

#### Changes Made:
- **Removed** early stock check at line ~139 (redundant and unsafe)
- **Added** atomic stock check in the `findOneAndUpdate` query at line ~193
- **Added** null check after update to handle insufficient stock scenario

#### Before (Vulnerable):
```javascript
// Early check (unsafe)
if (machineVariant.currentStock < quantity)
  return abort(400, `Insufficient stock...`);

// ... many lines later ...

// Update without re-checking
const updated = await Machine.findOneAndUpdate(
  { _id: machine._id, "variants.attribute": sv.attribute },
  { $inc: { "variants.$.currentStock": -sv.quantity } }
);
```

#### After (Safe):
```javascript
// No early check - let atomic operation handle it

// ... later ...

// Atomic operation: check and update together
const updated = await Machine.findOneAndUpdate(
  { 
    _id: machine._id, 
    "variants.attribute": sv.attribute,
    "variants.value": machineVariant.value,
    "variants.currentStock": { $gte: sv.quantity }  // ← Atomic check
  },
  { $inc: { "variants.$.currentStock": -sv.quantity } },
  { new: true, session }
);

if (!updated) {
  return abort(400, `Insufficient stock... Stock changed during transaction...`);
}
```

### 2. `/backend/modules/admin/purchasedMachines/admin.purchasedMachine.controller.js`

#### Changes Made:
- **Added** null check after `findOneAndUpdate` in `createPurchase` function
- **Added** null check after `findOneAndUpdate` in `addToInventory` function
- Ensures variant wasn't removed during transaction

#### Note:
While purchases don't have the negative stock issue (they add stock), the atomic pattern ensures consistency and catches edge cases like variant deletion during transaction.

## How Atomic Operation Prevents Race Condition

### Scenario: Two simultaneous sales of 3 units each, stock = 5

#### Without Atomic Operation (OLD):
```
Time    Sale A              Sale B              Stock
----    ------              ------              -----
T1      Check: 5 >= 3 ✓    Check: 5 >= 3 ✓    5
T2      Update: 5-3=2       (waiting)           2
T3      Success             Update: 2-3=-1      -1 ❌
```
**Result**: Negative stock!

#### With Atomic Operation (NEW):
```
Time    Sale A              Sale B              Stock
----    ------              ------              -----
T1      Atomic: Check+Update (waiting)          5
T2      5>=3? Yes, 5-3=2    Atomic: Check+Update 2
T3      Success             2>=3? No, abort     2 ✓
```
**Result**: Correct stock, second sale rejected!

## Benefits

1. **Thread-Safe**: Multiple concurrent requests cannot cause negative stock
2. **Data Integrity**: Stock values remain accurate under high load
3. **Atomic Guarantee**: Check and update happen in single database operation
4. **Transaction Safety**: Works correctly within MongoDB transactions
5. **No Race Conditions**: Impossible for two sales to both succeed when stock is insufficient

## Testing Recommendations

### Test Case 1: Concurrent Sales
- Create machine variant with stock = 5
- Send 2 simultaneous API requests to sell 3 units each
- Expected: One succeeds (stock = 2), one fails with "Insufficient stock"
- Old behavior: Both succeed (stock = -1) ❌

### Test Case 2: High Concurrency
- Create machine variant with stock = 100
- Send 50 simultaneous requests to sell 3 units each (total 150 units)
- Expected: ~33 succeed, ~17 fail, final stock = 1 or 0
- Old behavior: All might succeed, stock = -50 ❌

### Test Case 3: Edge Case - Exact Stock
- Create machine variant with stock = 3
- Send 2 simultaneous requests to sell 3 units each
- Expected: One succeeds (stock = 0), one fails
- Old behavior: Both succeed (stock = -3) ❌

## MongoDB Query Explanation

The key is adding the stock check **inside** the query filter:

```javascript
{
  _id: machine._id,
  "variants.attribute": sv.attribute,
  "variants.value": machineVariant.value,
  "variants.currentStock": { $gte: sv.quantity }  // ← This is the magic
}
```

MongoDB will:
1. Lock the document
2. Check ALL conditions (including stock >= quantity)
3. Only if ALL match, apply the update
4. If any condition fails, return null (no update)
5. Unlock the document

This makes it **impossible** for the race condition to occur.

## Performance Impact

- **Negligible**: Atomic operations are actually MORE efficient than separate read+update
- **Fewer Database Calls**: One query instead of two (read + update)
- **Better Concurrency**: MongoDB's internal locking is optimized for this pattern

## Conclusion

The atomic operation fix ensures that stock management is **thread-safe** and **race-condition-free**, preventing negative inventory even under high concurrent load. This is a critical fix for production environments.
