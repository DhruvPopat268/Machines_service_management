# Engineer Auth API Documentation

Base URL: `/api/engineer/auth`

All protected routes require the following header:
```
Authorization: Bearer <token>
```

---

## Public Routes

### 1. Login
`POST /api/engineer/auth/login`

**Request Body**
```json
{
  "email": "engineer@example.com",
  "password": "Password@123"
}
```

**Success Response** `200`
```json
{
  "success": true,
  "message": "Login successful",
  "token": "<jwt_token>"
}
```

**Error Responses**
| Status | Message |
|--------|---------|
| 400 | Email is required |
| 400 | Invalid email format |
| 400 | Password is required |
| 401 | Invalid credentials |
| 403 | Access denied |
| 403 | Account is inactive |

---

### 2. Send Forgot Password OTP
`POST /api/engineer/auth/send-forgot-password-otp`

**Request Body**
```json
{
  "email": "engineer@example.com"
}
```

**Success Response** `200`
```json
{
  "success": true,
  "message": "OTP sent to your email"
}
```

**Error Responses**
| Status | Message |
|--------|---------|
| 400 | Email is required |
| 403 | Account is inactive |
| 404 | Engineer not found |
| 500 | Failed to send OTP email |

---

### 3. Verify OTP & Reset Password
`POST /api/engineer/auth/verify-otp-reset-password`

**Request Body**
```json
{
  "email": "engineer@example.com",
  "otp": "123456",
  "newPassword": "NewPassword@123"
}
```

**Password Rules**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (`!@#$%^&*` etc.)

**Success Response** `200`
```json
{
  "success": true,
  "message": "Password reset successfully. Please login with your new password"
}
```

**Error Responses**
| Status | Message |
|--------|---------|
| 400 | Email, OTP and new password are required |
| 400 | No OTP request found. Please request an OTP first |
| 400 | Password validation error message |
| 401 | Invalid OTP |
| 401 | OTP has expired |
| 404 | Engineer not found |

> All active sessions are cleared after a successful password reset. A confirmation email is sent to the engineer.

---

## Protected Routes

> All routes below require `Authorization: Bearer <token>` header.

---

### 4. Logout
`POST /api/engineer/auth/logout`

**Headers**
```
Authorization: Bearer <token>
```

**Success Response** `200`
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Error Responses**
| Status | Message |
|--------|---------|
| 401 | Unauthorized |

---

### 5. Get Profile
`GET /api/engineer/auth/profile`

**Headers**
```
Authorization: Bearer <token>
```

**Success Response** `200`
```json
{
  "success": true,
  "data": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "name": "John Doe",
    "email": "engineer@example.com",
    "phone": "9800000000",
    "role": "Engineer"
  }
}
```

**Error Responses**
| Status | Message |
|--------|---------|
| 401 | Unauthorized |
| 404 | Engineer not found |

---

### 6. Update Profile
`PATCH /api/engineer/auth/update-profile`

**Headers**
```
Authorization: Bearer <token>
```

All fields are optional. Send only the fields you want to update.

**Request Body**
```json
{
  "name": "John Doe",
  "email": "newemail@example.com",
  "phone": "9900000000"
}
```

**Success Response** `200`
```json
{
  "success": true,
  "data": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "name": "John Doe",
    "email": "newemail@example.com",
    "phone": "9900000000",
    "role": "Engineer"
  }
}
```

**Error Responses**
| Status | Message |
|--------|---------|
| 400 | Nothing to update |
| 400 | Name must be a non-empty string |
| 400 | Phone must be a non-empty string |
| 400 | Email must be a non-empty string |
| 400 | Invalid email format |
| 401 | Unauthorized |
| 404 | Engineer not found |
| 409 | Email already exists |
| 409 | Phone number already exists |

---

### 7. Change Password
`POST /api/engineer/auth/change-password`

**Headers**
```
Authorization: Bearer <token>
```

**Request Body**
```json
{
  "currentPassword": "OldPassword@123",
  "newPassword": "NewPassword@456"
}
```

**Password Rules**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (`!@#$%^&*` etc.)

**Success Response** `200`
```json
{
  "success": true,
  "message": "Password changed successfully. Please login with your new password"
}
```

**Error Responses**
| Status | Message |
|--------|---------|
| 400 | Current password and new password are required |
| 400 | Current password is incorrect |
| 400 | New password must be different from current password |
| 400 | Password validation error message |
| 401 | Unauthorized |
| 404 | Engineer not found |

> All active sessions are cleared after a successful password change. A confirmation email is sent to the engineer.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ENGINEER_JWT_SECRET` | Secret key for signing JWT tokens | — |
| `ENGINEER_JWT_EXPIRES_IN` | JWT token expiry duration | `30d` |
| `ENGINEER_MAX_SESSIONS` | Max concurrent sessions per engineer | `3` |
| `ENGINEER_RESET_PASSWORD_OTP_EXPIRY` | OTP validity in minutes | `10` |
| `ENGINEER_APP_URL` | Engineer app URL used in emails | `#` |
