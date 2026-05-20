# Customer Authentication API Documentation

Base URL: `/api/customer/auth`

---

## Public Endpoints (No Authentication Required)

### 1. Get Active Zones

**Endpoint:** `GET /api/customer/auth/zones`

**Description:** Fetch all active zones for signup form

**Request Body:** None

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "zone_id_1",
      "name": "North Zone",
      "code": "NZ",
      "description": "Northern region"
    },
    {
      "_id": "zone_id_2",
      "name": "South Zone",
      "code": "SZ",
      "description": "Southern region"
    }
  ]
}
```

**Notes:**
- Returns only active zones
- Sorted alphabetically by name
- No authentication required

---

### 2. Signup

**Endpoint:** `POST /api/customer/auth/signup`

**Description:** Register a new customer account

**Request Body:**
```json
{
  "name": "John Doe",
  "phone": "9876543210",
  "email": "john.doe@example.com",
  "password": "SecurePass@123",
  "address": "123 Main Street, City",
  "zone": "zone_id_here",
  "gstNumber": "22AAAAA0000A1Z5"
}
```

**Required Fields:** `name`, `phone`, `email`, `password`, `address`, `zone`

**Optional Fields:** `gstNumber`

**Success Response (201):**
```json
{
  "success": true,
  "message": "Signup successful"
}
```

**Notes:**
- Password must be at least 6 characters
- Phone must be exactly 10 digits
- Email must be valid format
- Zone must be active
- Sets authentication cookie

---

### 2. Login

**Endpoint:** `POST /api/customer/auth/login`

**Description:** Login to customer account

**Request Body (Email):**
```json
{
  "email": "john.doe@example.com",
  "password": "SecurePass@123"
}
```

**Request Body (Phone):**
```json
{
  "phone": "9876543210",
  "password": "SecurePass@123"
}
```

**Required Fields:** (`email` OR `phone`) AND `password`

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful"
}
```

**Notes:**
- Can login with either email or phone
- Sets authentication cookie
- Maximum 3 concurrent sessions (configurable)

---

### 3. Send Reset Password OTP

**Endpoint:** `POST /api/customer/auth/send-reset-otp`

**Description:** Request OTP to reset password (for users who forgot password)

**Request Body:**
```json
{
  "email": "john.doe@example.com"
}
```

**Required Fields:** `email`

**Success Response (200):**
```json
{
  "success": true,
  "message": "OTP sent to your email"
}
```

**Notes:**
- OTP valid for 10 minutes (configurable)
- OTP is 6 digits
- Email sent to customer's registered email

---

### 4. Verify OTP and Reset Password

**Endpoint:** `POST /api/customer/auth/verify-otp-reset-password`

**Description:** Verify OTP and set new password

**Request Body:**
```json
{
  "email": "john.doe@example.com",
  "otp": "123456",
  "newPassword": "NewSecure@Pass456"
}
```

**Required Fields:** `email`, `otp`, `newPassword`

**Password Requirements:**
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- At least 1 special character

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password reset successful"
}
```

**Notes:**
- Logs out all active sessions
- Sends confirmation email
- OTP is removed after successful reset

---

## Authenticated Endpoints (Requires Login)

### 6. Get Profile Details

**Endpoint:** `GET /api/customer/auth/profile`

**Description:** Get logged-in customer profile information

**Request Body:** None

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "customer_id",
    "name": "John Doe",
    "phone": "9876543210",
    "email": "john.doe@example.com",
    "address": "123 Main Street, City",
    "zone": {
      "_id": "zone_id",
      "name": "North Zone",
      "code": "NZ",
      "description": "Northern region"
    },
    "gstNumber": "22AAAAA0000A1Z5",
    "totalPurchases": 0,
    "status": "Active",
    "source": "manual",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-02T00:00:00.000Z"
  }
}
```

**Notes:**
- Password is excluded from response
- Zone details are populated
- Account must be active

---

### 7. Logout

**Endpoint:** `POST /api/customer/auth/logout`

**Description:** Logout from current session

**Request Body:** None

**Success Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Notes:**
- Clears authentication cookie
- Removes current session from database

---

### 8. Update Profile

**Endpoint:** `PATCH /api/customer/auth/update-profile`

**Description:** Update customer profile information

**Request Body:**
```json
{
  "name": "John Updated",
  "phone": "9999999999",
  "address": "456 New Street, City",
  "zone": "new_zone_id_here",
  "gstNumber": "27BBBBB1111B1Z5"
}
```

**Optional Fields:** All fields are optional (send only fields to update)

**Success Response (200):**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "_id": "customer_id",
    "name": "John Updated",
    "phone": "9999999999",
    "email": "john.doe@example.com",
    "address": "456 New Street, City",
    "zone": "new_zone_id_here",
    "gstNumber": "27BBBBB1111B1Z5",
    "status": "Active",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-02T00:00:00.000Z"
  }
}
```

**Notes:**
- Cannot update email (use change email endpoint)
- Phone must be unique
- GST number must be unique
- Zone must be active
- Account must be active

---

### 9. Send Change Email OTP

**Endpoint:** `POST /api/customer/auth/send-change-email-otp`

**Description:** Request OTP to change email address

**Request Body:**
```json
{
  "newEmail": "newemail@example.com"
}
```

**Required Fields:** `newEmail`

**Success Response (200):**
```json
{
  "success": true,
  "message": "OTP sent to your new email"
}
```

**Notes:**
- OTP valid for 10 minutes (configurable)
- OTP sent to new email address
- New email must not already exist
- New email must be different from current

---

### 10. Verify OTP and Change Email

**Endpoint:** `POST /api/customer/auth/verify-otp-change-email`

**Description:** Verify OTP and update email address

**Request Body:**
```json
{
  "otp": "123456"
}
```

**Required Fields:** `otp`

**Success Response (200):**
```json
{
  "success": true,
  "message": "Email changed successfully"
}
```

**Notes:**
- Does not log out active sessions
- User can continue using the app with new email
- Sends notification to old email

---

### 11. Change Password

**Endpoint:** `POST /api/customer/auth/change-password`

**Description:** Change password for logged-in user

**Request Body:**
```json
{
  "currentPassword": "OldSecure@Pass123",
  "newPassword": "NewSecure@Pass456"
}
```

**Required Fields:** `currentPassword`, `newPassword`

**Password Requirements:**
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- At least 1 special character
- Must be different from current password

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password changed successfully. Please login with your new password"
}
```

**Notes:**
- Verifies current password before allowing change
- Logs out all active sessions
- Sends confirmation email
- Must login again after password change

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Error message describing the issue"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Account is inactive"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Customer not found"
}
```

### 409 Conflict
```json
{
  "success": false,
  "message": "Email already exists"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Error message"
}
```

---

## Authentication

Authenticated endpoints require a valid session cookie (`CustomerToken`) which is automatically set upon successful login or signup.

**Cookie Details:**
- Name: `CustomerToken`
- HttpOnly: true
- Secure: true (in production)
- SameSite: lax
- Max Age: 7 days (configurable)

---

## Environment Variables

```env
# JWT Configuration
CUSTOMER_JWT_SECRET=your_secret_key
CUSTOMER_JWT_EXPIRES_IN=7d
CUSTOMER_COOKIE_MAX_AGE=604800000
CUSTOMER_MAX_SESSIONS=3

# OTP Expiry (in minutes)
CUSTOMER_RESET_PASSWORD_EMAIL_OTP_EXPIRY=10
CUSTOMER_CHANGE_EMAIL_OTP_EXPIRY=10

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM_NAME=Machine Service Management
```

---

## Notes

1. All timestamps are in ISO 8601 format
2. All email addresses are stored in lowercase
3. Phone numbers must be exactly 10 digits (Indian format)
4. GST numbers are validated and stored in uppercase
5. Passwords are hashed using bcrypt with 10 salt rounds
6. OTPs are 6-digit random numbers
7. Sessions are automatically managed and limited per user
