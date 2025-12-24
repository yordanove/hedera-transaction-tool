# API Endpoints for k6 Performance Testing

Base URL: `http://localhost:3001` (dev) or `https://staging-transaction-tool.swirldslabs-devops.com` (staging)

---

## Performance Requirements (Updated Dec 2024)

### API-Testable (k6)

| # | Requirement | Endpoint | Count | Threshold |
|---|-------------|----------|-------|-----------|
| 1 | Sign All | POST `/transactions/:id/signers` | 200 txns | ≤ 4s total |
| 2 | Ready to Sign | GET `/transactions/sign?size=200` | 200 txns | ≤ 1s |
| 4 | Ready for Review | GET `/transactions/approve?size=100` | 100 txns | ≤ 1s |
| 5 | Users/Contacts | GET `/users` | 100+ users | ≤ 1s |
| 8 | History | GET `/transactions/history?size=500` | 500+ items | ≤ 1s |

### Browser-Only (Local SQLite - k6 browser or Playwright)

| # | Requirement | Local Model | Count | Threshold |
|---|-------------|-------------|-------|-----------|
| 3 | Draft Transactions | `TransactionDraft` | 100 drafts | ≤ 1s |
| 6 | Accounts | `HederaAccount` | 100+ accounts | ≤ 1s |
| 7 | Files | `HederaFile` | 100+ files | ≤ 1s |
| 9 | App Startup | - | - | TBD |

### Additional UI Requirements
- UI remains responsive (no freezes) during Sign All
- Scrolling is smooth with no visible lag
- No visible layout shifts during page load

---

## Key Endpoints for Performance Testing

### Priority 1: Ready to Sign Flow (Main Requirement)

| Method | Endpoint | Description | Notes |
|--------|----------|-------------|-------|
| POST | `/auth/login` | Authenticate user | Required for all tests |
| GET | `/transactions/sign` | Get transactions to sign | **Primary target** - page load time |
| POST | `/transactions/:transactionId/signers` | Upload signature map | **Primary target** - sign performance |
| GET | `/transactions/:transactionId/signers` | Get signatures | Verify signing |

### Priority 2: Other Tab Load Times

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/transactions` | All transactions list |
| GET | `/transactions/history` | Executed/failed/expired |
| GET | `/transactions/approve` | Transactions to approve (Ready for Review) |
| GET | `/notifications` | User notifications |
| GET | `/users` | Users/Contacts list |

### Priority 3: Transaction Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/transactions` | Create transaction |
| PATCH | `/transactions/execute/:id` | Execute manual transaction |
| GET | `/transactions/:id` | Get single transaction |

---

## Full Endpoint Reference

### Auth (`/auth`)
```
POST   /auth/login          - User login
POST   /auth/logout         - User logout
POST   /auth/signup         - Create user (Admin)
PATCH  /auth/change-password
```

### Transactions (`/transactions`)
```
POST   /transactions                    - Create transaction
GET    /transactions                    - List all (paginated)
GET    /transactions/history            - Executed/failed/expired
GET    /transactions/sign               - To sign (user-specific)
GET    /transactions/approve            - To approve (user-specific)
GET    /transactions/:id                - Get single
PATCH  /transactions/cancel/:id         - Cancel
PATCH  /transactions/execute/:id        - Execute manual
DELETE /transactions/:id                - Delete
```

### Transaction Signers (`/transactions/:transactionId/signers`)
```
GET    /transactions/:id/signers        - Get signatures
GET    /transactions/:id/signers/user   - User's signatures
POST   /transactions/:id/signers        - Upload signature map
```

### Transaction Groups (`/transaction-groups`)
```
POST   /transaction-groups              - Create group
GET    /transaction-groups              - List all
GET    /transaction-groups/:id          - Get single
DELETE /transaction-groups/:id          - Delete
```

### Users (`/users`)
```
GET    /users                           - List all
GET    /users/me                        - Current user
GET    /users/:id                       - Get by ID
```

### Notifications (`/notifications`)
```
GET    /notifications                   - List (paginated)
GET    /notifications/count             - Count
PATCH  /notifications                   - Update multiple
```

---

## Authentication

All endpoints require JWT token in header:
```
Authorization: Bearer <token>
```

Login response returns:
```json
{
  "accessToken": "eyJ...",
  "user": { ... }
}
```

---

## Pagination Parameters

Endpoints with pagination support:
- `page` - Page number (default: 1)
- `size` or `limit` - Items per page
- `sort` - Sort field
- `order` - ASC/DESC

Example: `GET /transactions?page=1&size=200&sort=createdAt&order=DESC`

---

## k6 Test Scenarios Mapping

| Hedera Requirement | Endpoint(s) | Threshold | Test Type |
|--------------------|-------------|-----------|-----------|
| Sign All (200 txns) | POST `/transactions/:id/signers` x200 | ≤ 4000ms total | API |
| Ready to Sign (200) | GET `/transactions/sign?size=200` | ≤ 1000ms (p95) | API |
| Ready for Review | GET `/transactions/approve?size=100` | ≤ 1000ms (p95) | API |
| History (500+) | GET `/transactions/history?size=500` | ≤ 1000ms (p95) | API |
| Users/Contacts | GET `/users` | ≤ 1000ms (p95) | API |
| Draft Transactions | Local SQLite | ≤ 1000ms | Browser |
| Accounts | Local SQLite | ≤ 1000ms | Browser |
| Files | Local SQLite | ≤ 1000ms | Browser |
| App Startup | - | TBD | Browser |
