# Service Call API Documentation

## Table of Contents
1. [Raise Service Call](#raise-service-call)
2. [Get Dashboard Stats](#get-dashboard-stats)
3. [Get Active Calls](#get-active-calls)
4. [Get Completed Calls](#get-completed-calls)
5. [Get Cancelled Calls](#get-cancelled-calls)
6. [Get Call Detail](#get-call-detail)

---

## Raise Service Call

## Endpoint
```
POST /api/customer/service-calls/raise
```

## Authentication
Requires customer authentication token in headers:
```
Authorization: Bearer <customer_token>
```

## Content Type
```
multipart/form-data
```

## Request Body

### Field: `serviceCalls` (Required)
A JSON string containing an array of service call objects. Each object represents a machine variant with its issue details.

**Format:**
```json
[
  {
    "variantId": "6a0d8b2c3cc33d96e78563b1",
    "issueDescription": "Machine not starting properly",
    "problemTypeId": "69e8af3ec7c38becf9605bd7"
  },
  {
    "variantId": "6a0d8b2c3cc33d96e78563b3",
    "issueDescription": "Making strange noise during operation",
    "problemTypeId": "69e8af3ec7c38becf9605bd8"
  }
]
```

**Fields per service call:**
- `variantId` (string, required) - MongoDB ObjectId of the machine variant from sold machines
- `issueDescription` (string, required) - Description of the issue/problem
- `problemTypeId` (string, optional) - MongoDB ObjectId of the problem type

### Field: `images_<index>` (Optional)
Upload images for specific variants using field names with index pattern.

**Pattern:** `images_0`, `images_1`, `images_2`, etc.
- The index corresponds to the position of the service call in the `serviceCalls` array
- Multiple images can be uploaded for each variant using the same field name

**Allowed formats:** jpg, jpeg, png, webp  
**Max file size:** 5MB per image  
**Processing:** Images are automatically resized to 800px width and converted to WebP format

---

## Example Request

### Using Postman / Form Data

**Form Fields:**

| Key | Type | Value |
|-----|------|-------|
| `serviceCalls` | Text | `[{"variantId":"6a0d8b2c3cc33d96e78563b1","issueDescription":"Machine not starting","problemTypeId":"69e8af3ec7c38becf9605bd7"},{"variantId":"6a0d8b2c3cc33d96e78563b3","issueDescription":"Making noise","problemTypeId":"69e8af3ec7c38becf9605bd8"}]` |
| `images_0` | File | image1.jpg |
| `images_0` | File | image2.jpg |
| `images_1` | File | image3.png |

**Explanation:**
- First variant (index 0) gets `image1.jpg` and `image2.jpg`
- Second variant (index 1) gets `image3.png`

---

### Using JavaScript / Fetch API

```javascript
const formData = new FormData();

// Add service calls data
const serviceCalls = [
  {
    variantId: "6a0d8b2c3cc33d96e78563b1",
    issueDescription: "Machine not starting properly",
    problemTypeId: "69e8af3ec7c38becf9605bd7"
  },
  {
    variantId: "6a0d8b2c3cc33d96e78563b3",
    issueDescription: "Making strange noise during operation",
    problemTypeId: "69e8af3ec7c38becf9605bd8"
  }
];

formData.append('serviceCalls', JSON.stringify(serviceCalls));

// Add images for first variant (index 0)
formData.append('images_0', file1); // First image for variant 0
formData.append('images_0', file2); // Second image for variant 0

// Add images for second variant (index 1)
formData.append('images_1', file3); // First image for variant 1

// Make request
const response = await fetch('/api/customer/service-calls/raise', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${customerToken}`
  },
  body: formData
});

const result = await response.json();
console.log(result);
```

---

### Using Axios

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const formData = new FormData();

// Add service calls
formData.append('serviceCalls', JSON.stringify([
  {
    variantId: "6a0d8b2c3cc33d96e78563b1",
    issueDescription: "Machine not starting",
    problemTypeId: "69e8af3ec7c38becf9605bd7"
  },
  {
    variantId: "6a0d8b2c3cc33d96e78563b3",
    issueDescription: "Making noise",
    problemTypeId: "69e8af3ec7c38becf9605bd8"
  }
]));

// Add images
formData.append('images_0', fs.createReadStream('path/to/image1.jpg'));
formData.append('images_0', fs.createReadStream('path/to/image2.jpg'));
formData.append('images_1', fs.createReadStream('path/to/image3.png'));

const response = await axios.post(
  '/api/customer/service-calls/raise',
  formData,
  {
    headers: {
      'Authorization': `Bearer ${customerToken}`,
      ...formData.getHeaders()
    }
  }
);

console.log(response.data);
```

---

## Response

### Success Response (201 Created)

```json
{
  "success": true,
  "message": "Service call raised successfully",
  "data": {
    "_id": "6a0d8b2c3cc33d96e78563c5",
    "callId": "SC-1",
    "customerInfo": {
      "customerId": "6a0d8b2c3cc33d96e78563a1",
      "name": "John Doe",
      "phone": "9876543210",
      "email": "john@example.com",
      "address": "123 Main Street, City",
      "zone": "North Zone",
      "gstNumber": "29ABCDE1234F1Z5"
    },
    "machines": [
      {
        "variantId": "6a0d8b2c3cc33d96e78563b1",
        "machineId": "6a0d8b2c3cc33d96e78563a5",
        "machineName": "CNC Machine X200",
        "modelNumber": "X200",
        "serialNumber": "Red",
        "divisionId": "6a0d8b2c3cc33d96e78563a3",
        "division": "CNC Division",
        "categoryId": "6a0d8b2c3cc33d96e78563a2",
        "category": "Heavy Machinery",
        "attributeName": "Color",
        "attributeValue": "Red",
        "contractType": {
          "contractTypeId": "6a0d8b2c3cc33d96e78563a4",
          "name": "Premium Support",
          "code": "PREM",
          "freeService": true,
          "freeParts": false,
          "validFrom": "2024-01-01T00:00:00.000Z",
          "validTo": "2025-01-01T00:00:00.000Z"
        },
        "issueDescription": "Machine not starting properly",
        "problemTypeId": "69e8af3ec7c38becf9605bd7",
        "problemType": "Electrical Issue",
        "images": [
          "https://backend.example.com/app/cloud/images/service-calls/servicecall_1234567890_abc123.webp",
          "https://backend.example.com/app/cloud/images/service-calls/servicecall_1234567891_def456.webp"
        ]
      },
      {
        "variantId": "6a0d8b2c3cc33d96e78563b3",
        "machineId": "6a0d8b2c3cc33d96e78563a6",
        "machineName": "Laser Cutter L10",
        "modelNumber": "L10",
        "serialNumber": "Blue",
        "divisionId": "6a0d8b2c3cc33d96e78563a7",
        "division": "Laser Division",
        "categoryId": "6a0d8b2c3cc33d96e78563a8",
        "category": "Light Machinery",
        "attributeName": "Color",
        "attributeValue": "Blue",
        "contractType": {
          "contractTypeId": "6a0d8b2c3cc33d96e78563a9",
          "name": "Basic Support",
          "code": "BASIC",
          "freeService": false,
          "freeParts": false,
          "validFrom": "2024-01-01T00:00:00.000Z",
          "validTo": "2025-01-01T00:00:00.000Z"
        },
        "issueDescription": "Making strange noise during operation",
        "problemTypeId": "69e8af3ec7c38becf9605bd8",
        "problemType": "Mechanical Issue",
        "images": [
          "https://backend.example.com/app/cloud/images/service-calls/servicecall_1234567892_ghi789.webp"
        ]
      }
    ],
    "status": "Open",
    "dates": {
      "created": "2024-01-15T10:30:00.000Z"
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Error Responses

#### 400 Bad Request - Missing serviceCalls
```json
{
  "success": false,
  "message": "serviceCalls field is required"
}
```

#### 400 Bad Request - Invalid JSON
```json
{
  "success": false,
  "message": "Invalid serviceCalls JSON format",
  "error": "Unexpected token..."
}
```

#### 400 Bad Request - Invalid Variant ID
```json
{
  "success": false,
  "message": "Invalid variant ID format at index 0: invalid_id"
}
```

#### 400 Bad Request - Missing Issue Description
```json
{
  "success": false,
  "message": "Issue description is required for service call at index 0"
}
```

#### 400 Bad Request - Invalid Image Type
```json
{
  "success": false,
  "message": "Invalid file type. Allowed: jpg, jpeg, png, webp"
}
```

#### 404 Not Found - Customer Not Found
```json
{
  "success": false,
  "message": "Customer not found or inactive"
}
```

#### 404 Not Found - Variant Not Found
```json
{
  "success": false,
  "message": "No machines found for the provided variant IDs"
}
```

#### 404 Not Found - Problem Type Not Found
```json
{
  "success": false,
  "message": "Problem type not found for ID: 69e8af3ec7c38becf9605bd7"
}
```

#### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Failed to raise service call"
}
```

---

## Important Notes

1. **Call ID**: Automatically generated in format SC-1, SC-2, SC-3, etc.
2. **Variant IDs**: Must belong to machines owned by the authenticated customer
3. **Customer Status**: Only active customers can raise service calls
4. **Image Processing**: All images are automatically compressed and converted to WebP format
5. **Image Storage**: Images are stored in `/app/cloud/images/service-calls/` directory
6. **Status**: Service calls are created with status "Open" by default
7. **Priority**: Priority is not set initially - admin will set it during review
8. **Engineer**: Engineer is not assigned initially - admin will assign during review
9. **Multiple Variants**: You can raise service calls for multiple machine variants in a single request
10. **Images Per Variant**: Each variant can have its own set of images using the `images_<index>` pattern

---

## Workflow

1. Customer selects one or more machine variants from their owned machines
2. For each variant, customer provides:
   - Issue description
   - Problem type (optional)
   - Images (optional)
3. Customer submits the form
4. Backend validates all data
5. Images are processed and uploaded
6. Service call is created with status "Open"
7. Admin reviews the service call and:
   - Sets priority
   - Assigns engineer
   - Updates status to "Assigned"
8. Engineer receives notification and starts work


---

## Get Dashboard Stats

### Endpoint
```
GET /api/customer/service-calls/dashboard
```

### Authentication
Requires customer authentication token in headers:
```
Authorization: Bearer <customer_token>
```

### Description
Returns aggregated data for the customer's home page dashboard including stats, first 5 expired contract machines, and first 5 active calls.

### Response

#### Success Response (200 OK)
```json
{
  "success": true,
  "data": {
    "stats": {
      "totalOwnedMachines": 10,
      "expiredContractMachines": 3,
      "totalRaisedCalls": 8,
      "totalCompletedCalls": 5
    },
    "expiredContractMachines": [
      {
        "machineId": "6a0d8b2c3cc33d96e78563a5",
        "machineName": "CNC Machine X200",
        "modelNumber": "X200",
        "category": "Heavy Machinery",
        "division": "CNC Division",
        "variant": {
          "_id": "6a0d8b2c3cc33d96e78563b1",
          "attribute": "6a0d8b2c3cc33d96e78563c1",
          "name": "Red",
          "value": "Red",
          "quantity": 1,
          "price": 50000,
          "discountedPrice": null,
          "total": 50000,
          "contractType": {
            "contractTypeId": "6a0d8b2c3cc33d96e78563a4",
            "name": "Premium Support",
            "code": "PREM",
            "freeService": true,
            "freeParts": false,
            "validFrom": "2023-01-01T00:00:00.000Z",
            "validTo": "2024-01-01T00:00:00.000Z"
          },
          "deductedFromInventory": true
        }
      }
    ],
    "activeCalls": [
      {
        "_id": "6a0d8b2c3cc33d96e78563c5",
        "callId": "SC-1",
        "machines": [
          {
            "machineName": "CNC Machine X200",
            "modelNumber": "X200",
            "division": "CNC Division",
            "category": "Heavy Machinery",
            "issueDescription": "Machine not starting properly",
            "problemType": "Electrical Issue"
          }
        ],
        "status": "In Progress",
        "priority": "High",
        "engineerInfo": {
          "engineerId": "6a0d8b2c3cc33d96e78563d1",
          "name": "Engineer Name"
        },
        "dates": {
          "created": "2024-01-15T10:30:00.000Z",
          "assigned": "2024-01-15T11:00:00.000Z",
          "inProgress": "2024-01-15T12:00:00.000Z"
        },
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-15T12:00:00.000Z"
      }
    ]
  }
}
```

#### Error Response (500 Internal Server Error)
```json
{
  "success": false,
  "message": "Failed to fetch dashboard stats"
}
```

---

## Get Active Calls

### Endpoint
```
GET /api/customer/service-calls/active
```

### Authentication
Requires customer authentication token in headers:
```
Authorization: Bearer <customer_token>
```

### Description
Returns all service calls with status: Open, Assigned, In Progress, or On Hold for the authenticated customer.

### Response

#### Success Response (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "_id": "6a0d8b2c3cc33d96e78563c5",
      "callId": "SC-1",
      "customerInfo": {
        "customerId": "6a0d8b2c3cc33d96e78563a1",
        "name": "John Doe",
        "phone": "9876543210",
        "email": "john@example.com",
        "address": "123 Main Street, City",
        "zone": "North Zone",
        "gstNumber": "29ABCDE1234F1Z5"
      },
      "machines": [
        {
          "variantId": "6a0d8b2c3cc33d96e78563b1",
          "machineId": "6a0d8b2c3cc33d96e78563a5",
          "machineName": "CNC Machine X200",
          "modelNumber": "X200",
          "serialNumber": "Red",
          "divisionId": "6a0d8b2c3cc33d96e78563a3",
          "division": "CNC Division",
          "categoryId": "6a0d8b2c3cc33d96e78563a2",
          "category": "Heavy Machinery",
          "attributeName": "Color",
          "attributeValue": "Red",
          "contractType": {
            "contractTypeId": "6a0d8b2c3cc33d96e78563a4",
            "name": "Premium Support",
            "code": "PREM",
            "freeService": true,
            "freeParts": false,
            "validFrom": "2024-01-01T00:00:00.000Z",
            "validTo": "2025-01-01T00:00:00.000Z"
          },
          "issueDescription": "Machine not starting properly",
          "problemTypeId": "69e8af3ec7c38becf9605bd7",
          "problemType": "Electrical Issue",
          "images": []
        }
      ],
      "status": "In Progress",
      "priority": "High",
      "engineerInfo": {
        "engineerId": "6a0d8b2c3cc33d96e78563d1",
        "name": "Engineer Name"
      },
      "dates": {
        "created": "2024-01-15T10:30:00.000Z",
        "assigned": "2024-01-15T11:00:00.000Z",
        "inProgress": "2024-01-15T12:00:00.000Z"
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T12:00:00.000Z"
    }
  ]
}
```

#### Error Response (500 Internal Server Error)
```json
{
  "success": false,
  "message": "Failed to fetch active calls"
}
```

---

## Get Completed Calls

### Endpoint
```
GET /api/customer/service-calls/completed
```

### Authentication
Requires customer authentication token in headers:
```
Authorization: Bearer <customer_token>
```

### Description
Returns all service calls with status "Completed" for the authenticated customer, sorted by completion date (newest first).

### Response

#### Success Response (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "_id": "6a0d8b2c3cc33d96e78563c6",
      "callId": "SC-2",
      "customerInfo": {
        "customerId": "6a0d8b2c3cc33d96e78563a1",
        "name": "John Doe",
        "phone": "9876543210",
        "email": "john@example.com",
        "address": "123 Main Street, City",
        "zone": "North Zone",
        "gstNumber": "29ABCDE1234F1Z5"
      },
      "machines": [
        {
          "variantId": "6a0d8b2c3cc33d96e78563b2",
          "machineId": "6a0d8b2c3cc33d96e78563a6",
          "machineName": "Laser Cutter L10",
          "modelNumber": "L10",
          "serialNumber": "Blue",
          "divisionId": "6a0d8b2c3cc33d96e78563a7",
          "division": "Laser Division",
          "categoryId": "6a0d8b2c3cc33d96e78563a8",
          "category": "Light Machinery",
          "attributeName": "Color",
          "attributeValue": "Blue",
          "contractType": {
            "contractTypeId": "6a0d8b2c3cc33d96e78563a9",
            "name": "Basic Support",
            "code": "BASIC",
            "freeService": false,
            "freeParts": false,
            "validFrom": "2024-01-01T00:00:00.000Z",
            "validTo": "2025-01-01T00:00:00.000Z"
          },
          "issueDescription": "Making strange noise",
          "problemTypeId": "69e8af3ec7c38becf9605bd8",
          "problemType": "Mechanical Issue",
          "images": []
        }
      ],
      "status": "Completed",
      "priority": "Medium",
      "engineerInfo": {
        "engineerId": "6a0d8b2c3cc33d96e78563d1",
        "name": "Engineer Name"
      },
      "dates": {
        "created": "2024-01-14T10:30:00.000Z",
        "assigned": "2024-01-14T11:00:00.000Z",
        "inProgress": "2024-01-14T12:00:00.000Z",
        "completed": "2024-01-14T16:00:00.000Z"
      },
      "createdAt": "2024-01-14T10:30:00.000Z",
      "updatedAt": "2024-01-14T16:00:00.000Z"
    }
  ]
}
```

#### Error Response (500 Internal Server Error)
```json
{
  "success": false,
  "message": "Failed to fetch completed calls"
}
```

---

## Get Cancelled Calls

### Endpoint
```
GET /api/customer/service-calls/cancelled
```

### Authentication
Requires customer authentication token in headers:
```
Authorization: Bearer <customer_token>
```

### Description
Returns all service calls with status "Cancelled" for the authenticated customer, sorted by cancellation date (newest first).

### Response

#### Success Response (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "_id": "6a0d8b2c3cc33d96e78563c7",
      "callId": "SC-3",
      "customerInfo": {
        "customerId": "6a0d8b2c3cc33d96e78563a1",
        "name": "John Doe",
        "phone": "9876543210",
        "email": "john@example.com",
        "address": "123 Main Street, City",
        "zone": "North Zone",
        "gstNumber": "29ABCDE1234F1Z5"
      },
      "machines": [
        {
          "variantId": "6a0d8b2c3cc33d96e78563b3",
          "machineId": "6a0d8b2c3cc33d96e78563a7",
          "machineName": "Drill Press DP500",
          "modelNumber": "DP500",
          "serialNumber": "Green",
          "divisionId": "6a0d8b2c3cc33d96e78563a8",
          "division": "Tools Division",
          "categoryId": "6a0d8b2c3cc33d96e78563a9",
          "category": "Medium Machinery",
          "attributeName": "Color",
          "attributeValue": "Green",
          "contractType": {
            "contractTypeId": "6a0d8b2c3cc33d96e78563b0",
            "name": "Standard Support",
            "code": "STD",
            "freeService": true,
            "freeParts": true,
            "validFrom": "2024-01-01T00:00:00.000Z",
            "validTo": "2025-01-01T00:00:00.000Z"
          },
          "issueDescription": "Issue resolved by customer",
          "problemTypeId": "69e8af3ec7c38becf9605bd9",
          "problemType": "Other",
          "images": []
        }
      ],
      "status": "Cancelled",
      "priority": "Low",
      "dates": {
        "created": "2024-01-13T10:30:00.000Z",
        "cancelled": "2024-01-13T11:00:00.000Z"
      },
      "createdAt": "2024-01-13T10:30:00.000Z",
      "updatedAt": "2024-01-13T11:00:00.000Z"
    }
  ]
}
```

#### Error Response (500 Internal Server Error)
```json
{
  "success": false,
  "message": "Failed to fetch cancelled calls"
}
```

---

## Get Call Detail

### Endpoint
```
GET /api/customer/service-calls/:id
```

### Authentication
Requires customer authentication token in headers:
```
Authorization: Bearer <customer_token>
```

### URL Parameters
- `id` (required) - MongoDB ObjectId of the service call

### Description
Returns complete details of a specific service call. Only returns the call if it belongs to the authenticated customer.

### Example Request
```
GET /api/customer/service-calls/6a0d8b2c3cc33d96e78563c5
```

### Response

#### Success Response (200 OK)
```json
{
  "success": true,
  "data": {
    "_id": "6a0d8b2c3cc33d96e78563c5",
    "callId": "SC-1",
    "customerInfo": {
      "customerId": "6a0d8b2c3cc33d96e78563a1",
      "name": "John Doe",
      "phone": "9876543210",
      "email": "john@example.com",
      "address": "123 Main Street, City",
      "zone": "North Zone",
      "gstNumber": "29ABCDE1234F1Z5"
    },
    "machines": [
      {
        "variantId": "6a0d8b2c3cc33d96e78563b1",
        "machineId": "6a0d8b2c3cc33d96e78563a5",
        "machineName": "CNC Machine X200",
        "modelNumber": "X200",
        "serialNumber": "Red",
        "divisionId": "6a0d8b2c3cc33d96e78563a3",
        "division": "CNC Division",
        "categoryId": "6a0d8b2c3cc33d96e78563a2",
        "category": "Heavy Machinery",
        "attributeName": "Color",
        "attributeValue": "Red",
        "contractType": {
          "contractTypeId": "6a0d8b2c3cc33d96e78563a4",
          "name": "Premium Support",
          "code": "PREM",
          "freeService": true,
          "freeParts": false,
          "validFrom": "2024-01-01T00:00:00.000Z",
          "validTo": "2025-01-01T00:00:00.000Z"
        },
        "issueDescription": "Machine not starting properly",
        "problemTypeId": "69e8af3ec7c38becf9605bd7",
        "problemType": "Electrical Issue",
        "images": [
          "https://backend.example.com/app/cloud/images/service-calls/servicecall_1234567890_abc123.webp"
        ]
      }
    ],
    "status": "In Progress",
    "priority": "High",
    "engineerInfo": {
      "engineerId": "6a0d8b2c3cc33d96e78563d1",
      "name": "Engineer Name"
    },
    "dates": {
      "created": "2024-01-15T10:30:00.000Z",
      "assigned": "2024-01-15T11:00:00.000Z",
      "inProgress": "2024-01-15T12:00:00.000Z"
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T12:00:00.000Z"
  }
}
```

#### Error Response (404 Not Found)
```json
{
  "success": false,
  "message": "Service call not found"
}
```

#### Error Response (500 Internal Server Error)
```json
{
  "success": false,
  "message": "Failed to fetch call detail"
}
```

---

## API Summary

| Endpoint | Method | Description | Authentication |
|----------|--------|-------------|----------------|
| `/api/customer/service-calls/raise` | POST | Raise a new service call | Required |
| `/api/customer/service-calls/dashboard` | GET | Get dashboard stats & sections | Required |
| `/api/customer/service-calls/active` | GET | Get all active calls | Required |
| `/api/customer/service-calls/completed` | GET | Get all completed calls | Required |
| `/api/customer/service-calls/cancelled` | GET | Get all cancelled calls | Required |
| `/api/customer/service-calls/:id` | GET | Get specific call details | Required |

---

## Status Flow

```
Open → Assigned → In Progress → Completed
  ↓                    ↓
Cancelled          On Hold → In Progress
```

**Status Definitions:**
- **Open**: Service call raised, waiting for admin review
- **Assigned**: Engineer assigned, waiting to start work
- **In Progress**: Engineer actively working on the issue
- **On Hold**: Work temporarily paused
- **Completed**: Issue resolved successfully
- **Cancelled**: Service call cancelled by customer or admin
