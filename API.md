# Gadget Shop API — Endpoint Reference

REST API for a gadget e-commerce store. Express 5 + TypeScript + Prisma 7 + PostgreSQL.

## Conventions

- **Base URL:** `http://localhost:5000/api/v1` (all routes below are relative to this)
- **Auth:** `Authorization: Bearer <token>` header. Token obtained from `POST /auth/login` or `POST /auth/register`.
- **Roles:** `ADMIN` and `CUSTOMER` (registration always assigns `CUSTOMER`).
- **Success envelope:**
  ```json
  { "success": true, "message": "...", "data": { ... } }
  ```
- **Paginated envelope:**
  ```json
  { "success": true, "message": "...", "data": [ ... ], "pagination": { "currentPage": 1, "pageSize": 10, "total": 42, "totalPages": 5 } }
  ```
- **Error envelope (status ≥ 400):**
  ```json
  { "success": false, "message": "..." }
  ```
- **Soft delete:** most master entities (user, category, product, review, order) carry an `isDeleted` flag. `DELETE` soft-deletes by default; add `?permanent=true` for a real delete. `PATCH { "isDeleted": false }` restores.
- **Common status codes:** `200` OK · `201` Created · `400` Bad request / validation · `401` Missing/invalid token · `403` Authenticated but wrong role · `404` Not found · `500` Internal server error.

---

## Auth (`/auth`) — public

### POST /auth/register
Create a customer account (role always `CUSTOMER`).
```json
{ "name": "John Doe", "email": "john@example.com", "password": "secret123" }
```
**Response 201:** `{ "user": { id, name, email, role, createdAt, updatedAt }, "token": "<jwt>" }`
**Errors:** 400 missing fields / email already registered

### POST /auth/login
```json
{ "email": "john@example.com", "password": "secret123" }
```
**Response 200:** `{ "user": { id, name, email, role, createdAt, updatedAt }, "token": "<jwt>" }`
**Errors:** 401 invalid email/password or deleted account

### GET /auth/me — Bearer
**Response 200:** current user incl. `isDeleted`
**Errors:** 401

---

## Users (`/users`) — ADMIN only (all routes)

### POST /users
```json
{ "name": "Jane Doe", "email": "jane@example.com", "password": "secret123", "role": "ADMIN" }
```
`role` optional, defaults to `CUSTOMER`. **201** → user (no password). **400** bad role / invalid email / duplicate email.

### GET /users
Query: `?page=1&pageSize=10&search=foo&includeDeleted=true`
- `search`: name or email substring (case-insensitive)
- `includeDeleted`: admin only, default false
**200** → paginated users (no password).

### GET /users/:id
**200** → user + `_count.orders`, `_count.reviews`. **404** not found.

### PATCH /users/:id
Any of: `{ "name", "email", "password", "role", "isDeleted" }` — set `"isDeleted": false` to restore.
**200** → updated user. **400** validation / duplicate email. **404** not found.

### DELETE /users/:id
`?permanent=true` for hard delete (blocked with 400 if the user has orders). Soft delete otherwise.
**200** → `{ id, message }`. **400** self-delete / user has orders (permanent). **404** not found.

---

## Categories (`/categories`)

Reads are **public**; writes are **ADMIN**.

### GET /categories — public
Query: `?page&pageSize&search&includeDeleted` (same semantics as users).
**200** → paginated categories.

### GET /categories/:id — public
**200** → category. **404** missing or soft-deleted.

### POST /categories — admin
```json
{ "name": "Smartphones" }
```
**201** → category. **400** missing / empty / duplicate name.

### PATCH /categories/:id — admin
`{ "name" }` rename, or `{ "isDeleted": false }` to restore. **200** → category. **400/404**.

### DELETE /categories/:id — admin
`?permanent=true` hard delete (400 if products reference it). **200** → `{ id, message }`.

---

## Products (`/products`)

Reads are **public**; writes are **ADMIN**.

### GET /products — public
Query:
- `page` (1), `pageSize` (10, max 100)
- `search` — title/brand substring, case-insensitive
- `categoryId` — exact category
- `minPrice` / `maxPrice` — price range
- `sortBy` — `newest` (default) | `price` | `rating`
- `order` — `asc` | `desc` (default: desc for newest, asc for price/rating; unrated products always sort last on rating)

**200** → paginated products; each row:
```json
{
  "id": "...", "title": "Apple iPhone 16", "brand": "Apple", "description": "...",
  "price": 999.99, "stock": 10, "image": null, "categoryId": "...",
  "isDeleted": false, "createdAt": "...", "updatedAt": "...",
  "category": { "id": "...", "name": "Smartphones" },
  "avgRating": 4.5, "ratingCount": 8
}
```
`avgRating` is `null` when the product has no reviews. **400** invalid sortBy/order/price params.

### GET /products/:id — public
**200** → single product (same shape as list rows, includes `category`, `avgRating`, `ratingCount`). **404** missing or soft-deleted.

### POST /products — admin
```json
{
  "title": "Wireless Mouse", "brand": "Logitech", "description": "...",
  "price": 49.99, "stock": 25, "image": "https://...", "categoryId": "<uuid>"
}
```
`brand`/`description`/`image`/`stock` optional (stock defaults 0). **201** → product. **400** missing title/price/categoryId, unknown category, negative price, non-integer stock.

### PATCH /products/:id — admin
Any of: `{ "title", "brand", "description", "price", "stock", "image", "categoryId", "isDeleted" }`.
**200** → product. **400/404** same rules as create.

### DELETE /products/:id — admin
`?permanent=true` hard delete (400 if the product appears in any order). **200** → `{ id, message }`.

---

## Reviews (`/reviews`) — Bearer required (all routes)

Customers manage **only their own** reviews; admins see all (and can moderate).

### POST /reviews — any authenticated user
```json
{ "productId": "<uuid>", "rating": 5, "comment": "Great gadget!" }
```
`rating` must be an integer 1–5. **201** → review (includes `user {id,name}`, `product {id,title}`).
**400** missing productId/rating, rating out of range, product missing/deleted, already reviewed this product.

### GET /reviews
- Customer: only their own reviews. Admin: all reviews.
- Query: `?productId=<uuid>` (filter by product), `?includeDeleted=true` (admin only), `?page&pageSize`.
**200** → paginated reviews.

### GET /reviews/:id — owner or admin
**200** → review. **404** missing, deleted (non-admin), or not yours.

### PATCH /reviews/:id — owner or admin
`{ "rating", "comment" }`; admins may also set `"isDeleted"`. **200** → review. **400/404**.

### DELETE /reviews/:id — owner or admin
`?permanent=true` hard delete. **200** → `{ id, message }`. **404** not yours.

---

## Cart (`/cart-items`) — Bearer required (scoped to your own cart)

### GET /cart-items
**200** →
```json
{
  "items": [
    { "id": "...", "userId": "...", "productId": "...", "quantity": 2,
      "createdAt": "...", "updatedAt": "...",
      "product": { "id": "...", "title": "...", "price": 49.99, "image": null, "stock": 25 },
      "lineTotal": 99.98 }
  ],
  "totalAmount": 99.98,
  "itemCount": 2
}
```

### POST /cart-items
```json
{ "productId": "<uuid>", "quantity": 2 }
```
`quantity` optional (default 1). If the product is already in the cart, quantity **increments**.
**201** → the cart item (with `lineTotal`). **400** missing productId, bad quantity, product missing/deleted.

### PATCH /cart-items/:id
```json
{ "quantity": 3 }
```
Sets the quantity (positive integer). **200** → item. **400** bad quantity. **404** not yours/missing.

### DELETE /cart-items/:id
**200** → `{ id, message }`. **404** not yours/missing.

### DELETE /cart-items/clear
**200** → `{ message, deletedCount }`.

---

## Wishlist (`/wishlist`) — Bearer required (scoped to your own wishlist)

### GET /wishlist
**200** → `{ "items": [ { "id", "userId", "productId", "createdAt", "updatedAt", "product": { id, title, price, image, stock } } ] }`

### POST /wishlist/toggle
```json
{ "productId": "<uuid>" }
```
Adds if absent, removes if present. **200** → `{ "inWishlist": true, "item": {...} }` or `{ "inWishlist": false }`.

### POST /wishlist
```json
{ "productId": "<uuid>" }
```
Idempotent add. **201** → `{ "item", "added": true }`; **200** → `{ "item", "added": false }` if already present. **400** missing productId / product missing.

### DELETE /wishlist/:id
**200** → `{ id, message }`. **404** not yours/missing.

---

## Orders (`/orders`) — Bearer required

### POST /orders — any authenticated user
Create an order from **your current cart** (no body). Validates stock, snapshots item prices, sets `status: PENDING`, `paymentStatus: UNPAID`, records the initial status-history row, then **clears the cart**.
**201** → order (single-order shape, see below). **400** empty cart / unavailable product / insufficient stock.

### GET /orders
- Customer: own orders only. Admin: all orders.
- Query: `?page&pageSize&includeDeleted=true` (admin only).
**200** → paginated orders (each with `orderItems`; no history in list).

### GET /orders/analytics — ADMIN only
Query: `?limit=5` (max 50).
**200** →
```json
{
  "totalRevenue": 1499.97,
  "orderCountByStatus": { "PENDING": 1, "PROCESSING": 0, "SHIPPED": 1, "DELIVERED": 0, "CANCELLED": 0 },
  "topSellingProducts": [
    { "productId": "...", "title": "Apple iPhone 16", "brand": "Apple", "totalQuantitySold": 3 }
  ]
}
```
`totalRevenue` = sum of `totalAmount` across **PAID**, non-deleted orders.

### GET /orders/:id — owner or admin
**200** →
```json
{
  "id": "...", "userId": "...", "totalAmount": 1499.97,
  "status": "SHIPPED", "paymentStatus": "PAID",
  "stripeSessionId": null, "transactionId": null, "isDeleted": false,
  "createdAt": "...", "updatedAt": "...",
  "orderItems": [
    { "id": "...", "productId": "...", "quantity": 1, "price": 999.99,
      "createdAt": "...", "updatedAt": "...",
      "product": { "id": "...", "title": "Apple iPhone 16" } }
  ],
  "statusHistory": [
    { "id": "...", "status": "PENDING", "changedBy": "...", "changedAt": "...",
      "user": { "id": "...", "name": "Demo Customer" } }
  ]
}
```
**404** missing, deleted (non-admin), or not yours.

### PATCH /orders/:id — ADMIN only
Any of:
```json
{ "status": "PROCESSING" }
{ "paymentStatus": "PAID" }
```
- `status` ∈ `PENDING | PROCESSING | SHIPPED | DELIVERED | CANCELLED`
- `paymentStatus` ∈ `UNPAID | PAID | REFUNDED`
- Every **actual** status change appends a history row (`changedBy` = admin). Re-sending the same status is a no-op (no history spam).
**200** → order (with history). **400** invalid enum value. **404** not found. **403** non-admin.

---

## Seed data

`npm run seed` (idempotent — safe to re-run) creates:

| Item | Value |
|---|---|
| Admin | `admin@example.com` / `admin123` |
| Demo customer | `customer1@example.com` / `customer123` |
| Categories | Smartphones, Audio, Wearables, Accessories |
| Products | 10 gadgets across those categories (existing rows are left untouched) |
| Reviews | Demo customer rated 3 products (5★, 4★, 3★) |
| Orders | 1× SHIPPED/PAID (10 days ago, with PROCESSING→SHIPPED history) + 1× PENDING/UNPAID |

Seed only creates data that doesn't exist; it never modifies or deletes existing records.
