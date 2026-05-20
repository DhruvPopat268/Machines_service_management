# Owned Machines API Documentation

## Base URL
```
/customer/owned-machines
```

## Authentication
All endpoints require customer authentication via JWT token.

---

## 1. Get Owned Machines List

### Endpoint
```
GET /customer/owned-machines/
```

### Description
Retrieves a paginated list of all machines (variants) owned by the authenticated customer.

### Query Parameters
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| page | Number | No | 1 | Page number |
| limit | Number | No | 10 | Items per page |

### Example Request
```
GET /customer/owned-machines/?page=1&limit=10
```

### Example Response
```json
{
  "success": true,
  "data": {
    "customerInfo": {
      "customerId": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "phone": "9876543210",
      "email": "john.doe@example.com",
      "address": "123 Main Street, City",
      "zone": "North Zone",
      "gstNumber": "29ABCDE1234F1Z5"
    },
    "machines": [
      {
        "machineId": "507f1f77bcf86cd799439012",
        "machineName": "Industrial Printer X200",
        "modelNumber": "IPX200-2024",
        "categoryId": "507f1f77bcf86cd799439013",
        "category": "Printing Machines",
        "divisionId": "507f1f77bcf86cd799439014",
        "division": "Industrial Equipment",
        "variant": {
          "_id": "507f1f77bcf86cd799439015",
          "attribute": "507f1f77bcf86cd799439016",
          "name": "Color",
          "value": "Blue",
          "quantity": 2,
          "price": 150000,
          "discountedPrice": 140000,
          "total": 280000,
          "contractType": {
            "contractTypeId": "507f1f77bcf86cd799439017",
            "name": "Premium Warranty",
            "code": "PW001",
            "freeService": true,
            "freeParts": true,
            "validFrom": "2024-01-01T00:00:00.000Z",
            "validTo": "2026-01-01T00:00:00.000Z"
          },
          "deductedFromInventory": true
        },
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-15T10:30:00.000Z"
      },
      {
        "machineId": "507f1f77bcf86cd799439018",
        "machineName": "Laser Cutter Pro",
        "modelNumber": "LCP500",
        "categoryId": "507f1f77bcf86cd799439019",
        "category": "Cutting Machines",
        "divisionId": "507f1f77bcf86cd799439020",
        "division": "Precision Tools",
        "variant": {
          "_id": "507f1f77bcf86cd799439021",
          "attribute": "507f1f77bcf86cd799439022",
          "name": "Power",
          "value": "500W",
          "quantity": 1,
          "price": 250000,
          "discountedPrice": null,
          "total": 250000,
          "contractType": {
            "contractTypeId": "507f1f77bcf86cd799439023",
            "name": "Basic Warranty",
            "code": "BW001",
            "freeService": false,
            "freeParts": false,
            "validFrom": "2024-02-01T00:00:00.000Z",
            "validTo": "2025-02-01T00:00:00.000Z"
          },
          "deductedFromInventory": true
        },
        "createdAt": "2024-02-10T14:20:00.000Z",
        "updatedAt": "2024-02-10T14:20:00.000Z"
      }
    ]
  },
  "pagination": {
    "total": 25,
    "page": 1,
    "limit": 10,
    "totalPages": 3
  }
}
```

### Response Fields
- `customerInfo`: Customer details
- `machines`: Array of machine variants (each variant is treated as a separate machine)
- `pagination`: Pagination metadata

### Status Codes
- `200 OK`: Success
- `401 Unauthorized`: Invalid or missing token
- `500 Internal Server Error`: Server error

---

## 2. Get Variant Detail

### Endpoint
```
GET /customer/owned-machines/:variantId
```

### Description
Retrieves detailed information about a specific machine variant owned by the authenticated customer.

### Path Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| variantId | String | Yes | MongoDB ObjectId of the variant |

### Example Request
```
GET /customer/owned-machines/507f1f77bcf86cd799439015
```

### Example Response
```json
{
  "success": true,
  "data": {
    "customerInfo": {
      "customerId": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "phone": "9876543210",
      "email": "john.doe@example.com",
      "address": "123 Main Street, City",
      "zone": "North Zone",
      "gstNumber": "29ABCDE1234F1Z5"
    },
    "machine": {
      "machineId": "507f1f77bcf86cd799439012",
      "machineName": "Industrial Printer X200",
      "modelNumber": "IPX200-2024",
      "categoryId": "507f1f77bcf86cd799439013",
      "category": "Printing Machines",
      "divisionId": "507f1f77bcf86cd799439014",
      "division": "Industrial Equipment"
    },
    "variant": {
      "_id": "507f1f77bcf86cd799439015",
      "attribute": "507f1f77bcf86cd799439016",
      "name": "Color",
      "value": "Blue",
      "quantity": 2,
      "price": 150000,
      "discountedPrice": 140000,
      "total": 280000,
      "contractType": {
        "contractTypeId": "507f1f77bcf86cd799439017",
        "name": "Premium Warranty",
        "code": "PW001",
        "freeService": true,
        "freeParts": true,
        "validFrom": "2024-01-01T00:00:00.000Z",
        "validTo": "2026-01-01T00:00:00.000Z"
      },
      "deductedFromInventory": true
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Response Fields
- `customerInfo`: Customer details
- `machine`: Machine details (name, model, category, division)
- `variant`: Complete variant information including contract type
- `createdAt`: When the machine was purchased
- `updatedAt`: Last update timestamp

### Status Codes
- `200 OK`: Success
- `401 Unauthorized`: Invalid or missing token
- `404 Not Found`: Variant not found or doesn't belong to customer
- `500 Internal Server Error`: Server error

---

## Notes

1. **Variant as Machine**: Each variant is treated as a separate machine in the response. If a machine has multiple variants (e.g., different colors or configurations), each variant appears as a separate item.

2. **Authentication**: All requests must include a valid customer JWT token in the Authorization header (Bearer token) or in cookies.

3. **Pagination**: The list endpoint supports pagination to handle large datasets efficiently.

4. **Contract Type**: Each variant includes contract type information with warranty details and validity period.

5. **Ownership Validation**: The API automatically filters results to show only machines owned by the authenticated customer.
