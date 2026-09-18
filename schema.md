# Database Schema (Firestore)

## Users (`/users/{userId}`)
Represents both buyers and cooks in the system.
- `uid` (string): User ID (same as Auth UID)
- `email` (string): User email address
- `displayName` (string): User's full name
- `role` (string): User role (`buyer`, `cook`, `admin`)
- `createdAt` (timestamp): Account creation time
- `balance` (number): Current wallet balance (default: 0)

## Meals (`/meals/{mealId}`)
Represents dishes prepared by cooks.
- `id` (string): Document ID
- `cookId` (string): Reference to `users/{userId}`
- `name` (string): Name of the meal
- `description` (string): Description of the meal
- `price` (number): Price of the meal
- `stock` (number): Available portions
- `imageUrl` (string): URL to the meal image
- `createdAt` (timestamp): Listing creation time

## Orders (`/orders/{orderId}`)
Represents orders placed by buyers.
- `id` (string): Document ID
- `buyerId` (string): Reference to `users/{userId}`
- `cookId` (string): Reference to `users/{userId}`
- `mealId` (string): Reference to `meals/{mealId}`
- `quantity` (number): Number of portions ordered
- `totalPrice` (number): Total order price
- `status` (string): Order status (`pending`, `paid`, `preparing`, `completed`, `cancelled`)
- `createdAt` (timestamp): Order creation time
- `paymentId` (string): Reference to external payment gateway (Iyzico)
