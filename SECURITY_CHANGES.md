# Security Implementation - Changelog

## Overview
This release implements critical security improvements focused on authentication, authorization, and data integrity based on the application's design requirements (cash payments for customers, Iyzico subscriptions for chefs).

## ⚠️ BREAKING CHANGES

All protected endpoints now require JWT authentication:
```
Authorization: Bearer <JWT_TOKEN>
```

Update mobile/web clients to:
1. Store JWT token after login
2. Include token in all requests to protected endpoints
3. Handle 401/403 responses with token refresh or re-login flow

## Changes Made

### 1. Authentication Middleware
**File:** `middleware/auth.js` (NEW)

- Created `authenticateJWT` middleware to verify JWT tokens
- Extracts `userId`, `email`, and `role` from token and attaches to `req.user`
- Created `authorizeRole` middleware for role-based access control
- Validates environment variable `JWT_SECRET` at startup
- Proper error handling for expired/invalid tokens

**Usage:**
```javascript
const { authenticateJWT, authorizeRole } = require('./middleware/auth');
router.post('/protected', authenticateJWT, authorizeRole('chef'), handler);
```

### 2. Auth Routes Protection
**File:** `routes/auth.js` (UPDATED)

**Changes:**
- `/auth/profile` endpoint now protected with `authenticateJWT`
- User ID extracted from JWT token (`req.user.userId`) instead of request body
- Implemented whitelist of allowed profile fields:
  - `isim_soyad`
  - `profileImageUrl`
  - `hijyenBelgesi`
  - `mutfakResmiUrl`
- Prevents mass-assignment attacks by rejecting unauthorized fields (`role`, `balance`, `password_hash`, etc.)
- Always updates `updatedAt` timestamp

### 3. Foods Routes Protection
**File:** `routes/foods.js` (UPDATED)

**Changes:**
- POST `/api/v1/chef/foods` - Protected with `authenticateJWT` + `authorizeRole('chef')`
  - `chefId` now extracted from `req.user.userId` instead of request body
  - Chef can only create foods for themselves
  
- PUT `/api/v1/chef/foods/:id` - Protected with authentication + authorization
  - Chef can only update their own foods
  - Ownership validation: `if (doc.data().chefId !== req.user.userId)`
  
- DELETE `/api/v1/chef/foods/:id` - Protected with authentication + authorization
  - Chef can only delete their own foods

**Security Impact:**
- Prevents other users from creating/editing/deleting foods under different chef identities
- Prevents unauthorized modification of food inventory

### 4. Orders Routes Protection
**File:** `routes/orders.js` (UPDATED)

**Changes:**
- POST `/api/v1/orders` - Protected with `authenticateJWT` + `authorizeRole('customer')`
  - `customerId` extracted from `req.user.userId` instead of request body
  - Customer can only create orders for themselves
  
- GET `/api/v1/orders` - Protected with authentication
  - Customer can only view their own orders
  - `customerId` parameter ignored; uses authenticated user's ID instead

**Security Impact:**
- Prevents users from creating orders as another customer
- Prevents viewing other customers' orders
- Ensures accurate tracking of cash-on-delivery payment status

### 5. Chef Orders Routes Protection
**File:** `routes/chef_orders.js` (UPDATED)

**Changes:**
- GET `/api/v1/chef/orders` - Protected with `authenticateJWT` + `authorizeRole('chef')`
  - Chef can only view their own orders
  
- PUT `/api/v1/chef/orders/:id/status` - Protected with authentication
  - Chef can only update status of their own orders
  - Ownership validation enforced

**Security Impact:**
- Prevents chefs from viewing/modifying other chefs' orders
- Ensures accurate order status tracking

### 6. Chef Subscription Protection
**File:** `routes/chef_subscription.js` (UPDATED)

**Changes:**
- GET `/status` - Protected with `authenticateJWT` + `authorizeRole('chef')`
- POST `/notify-payment` - Protected with `authenticateJWT` + `authorizeRole('chef')`
  - **CRITICAL:** `chefId` now extracted from JWT token, not request body
  - Chef can only notify payment for their own subscription
  - Prevents one chef from increasing another chef's limits

**Note:** In production, this endpoint should only be called after successful Iyzico webhook verification.

### 7. Finance Routes Protection
**File:** `routes/finance.js` (UPDATED)

**Changes:**
- All endpoints protected with `authenticateJWT` + `authorizeRole('chef')`
- **Fixed data model:** Now uses `users` collection instead of `chefs` collection
- Added transaction for withdrawal atomicity
  - Prevents concurrent withdrawal race conditions
  - Ensures balance and withdrawal record are created together
- Added amount validation (positive number, finite)

### 8. App.js Routes Organization
**File:** `app.js` (UPDATED)

**Changes:**
- Clearly separated PUBLIC routes (no auth required):
  - `/auth` - Login/Register
  - `/customer` - Chef browsing, food browsing
  - `/stories` - Story listing
  - `/ai` - AI endpoints
  
- All other routes are PROTECTED with authentication

## Security Principles Applied

1. **Never Trust Client Input for Identity**
   - User IDs extracted from JWT token, never from request body/params
   - Prevents identity spoofing

2. **Least Privilege**
   - Role-based authorization enforced at endpoint level
   - Users can only access their own resources

3. **Atomicity for Financial Operations**
   - Transactions used for balance updates + withdrawal records
   - Prevents partial updates

4. **Whitelist Over Blacklist**
   - Only explicitly allowed fields can be updated in profiles
   - Prevents mass-assignment attacks

5. **Defense in Depth**
   - Authentication middleware at app level
   - Authorization middleware at route level
   - Resource ownership validation at handler level

## Environment Variables Required

```env
JWT_SECRET=your-strong-secret-key-here
```

⚠️ Application will fail to start if `JWT_SECRET` is not set.

## Known Limitations & Future Work

### OTP System
- Currently disabled for development (SMS costs)
- Should be re-enabled for production with rate limiting

### Iyzico Webhook
- Webhook signature verification not yet implemented
- **ADD BEFORE PRODUCTION DEPLOYMENT**

### Pagination
- Not yet implemented - needed for scaling
- Recommend: Cursor-based pagination with Firestore indexes

### Rate Limiting
- Not yet implemented
- Critical for: Login, OTP, Upload, Payment endpoints

### Audit Logging
- Not yet implemented
- Recommend: Firestore collection for all financial operations

## Files Changed

- `middleware/auth.js` (NEW)
- `routes/auth.js` (UPDATED)
- `routes/foods.js` (UPDATED)
- `routes/orders.js` (UPDATED)
- `routes/chef_orders.js` (UPDATED)
- `routes/chef_subscription.js` (UPDATED)
- `routes/finance.js` (UPDATED)
- `app.js` (UPDATED)

## Testing Recommendations

### Unit Tests
- [ ] JWT generation and validation
- [ ] Role-based authorization
- [ ] Profile update field filtering
- [ ] Ownership validation for foods/orders

### Integration Tests
- [ ] Customer cannot create order as another customer
- [ ] Chef cannot update another chef's food
- [ ] Chef cannot view another chef's orders
- [ ] Chef cannot increase another chef's subscription limit
- [ ] Concurrent withdrawal attempts use transaction

### Security Tests
- [ ] Send token in Authorization header correctly
- [ ] Expired token rejected
- [ ] Invalid token rejected
- [ ] Missing token rejected on protected routes
- [ ] Attempt to access wrong role endpoint returns 403
- [ ] Direct `chefId`/`customerId` in request body ignored

## Deployment Checklist

- [ ] Set `JWT_SECRET` environment variable
- [ ] Verify JWT expiry time (currently 30 days)
- [ ] Review role assignment in user registration
- [ ] Set up Iyzico webhook for subscription payments
- [ ] Configure webhook signature verification
- [ ] Test cash-on-delivery flow end-to-end
- [ ] Monitor failed authentication attempts
- [ ] Review Firestore Rules alignment with authorization logic
