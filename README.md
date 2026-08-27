# Document Vault — GraphQL API

A clean, maintainable, schema-first GraphQL API for organizing documents into collections built with **Bun**, **TypeScript** (strict mode, zero `any`), **GraphQL Yoga**, **PostgreSQL**, and **Prisma**.

---

## ⚡ Quickstart

### Prerequisites
- [Bun](https://bun.sh)
- [Docker & Docker Compose](https://www.docker.com/)

### One-Command Setup & Run
Copy `.env.example` to `.env`, then run:

```sh
docker compose up -d && bun install && bun run gendb && bun run db:migrate --name init && bun run dev
```

The GraphQL API and GraphiQL interactive playground will be running at:  
👉 **`http://localhost:4000/graphql`**

---

## 🛠️ Scripts & Commands

- **`bun run sanity`** — Runs linting, typechecking, and unit tests in one command (`eslint` + `tsc` + `vitest`).
- **`bun run dev`** — Starts the dev server with hot reloading (`bun --watch src/server.ts`).
- **`bun run test`** — Runs Vitest test suite.
- **`bun run typecheck`** — Runs TypeScript strict typecheck (`tsc --noEmit`).
- **`bun run lint`** — Runs ESLint checks.
- **`bun run gendb`** — Generates Prisma Client code (`prisma generate`).
- **`bun run db:migrate`** — Applies Prisma database migrations (`prisma migrate dev`).

---

## 📊 Domain & Required Operations

### Data Models
- **`Collection`**: `id` (UUID), `name`, `slug` (unique), `createdAt`
- **`Document`**: `id` (UUID), `title`, `content`, `tags` (string array), `collectionId`, `isArchived` (boolean), `createdAt`

### Operations

#### Queries
- `collections`: Fetches all collections ordered by creation date (`createdAt desc`).
- `collection(id: ID!)`: Fetches a single collection with nested, paginated `documents`.
- `documents(collectionId: ID, search: String, isArchived: Boolean, take: Int = 20, cursor: ID)`: Filters documents by collection, archived status, or case-insensitive substring search on `title` or `content`, returning a `DocumentConnection` with cursor pagination.

#### Mutations
- `createCollection(input: CreateCollectionInput!)`: Creates a collection with name & slug validation.
- `createDocument(input: CreateDocumentInput!)`: Creates a document within an existing collection.
- `updateDocument(id: ID!, input: UpdateDocumentInput!)`: Updates title, content, tags, or archived state.
- `deleteDocument(id: ID!)`: Deletes a document by ID.
- `moveDocument(id: ID!, collectionId: ID!)`: Moves a document to another collection.

---

## 🛡️ Validation & Error Handling

Invalid inputs and database constraints return structured GraphQL errors with explicit `code` extensions rather than unhandled 500 server errors:

- **`BAD_USER_INPUT`**: Returned for empty/whitespace titles, empty/whitespace content, malformed slugs (regex: `^[a-z0-9]+(?:-[a-z0-9]+)*$`), or invalid `take` values (< 1 or > 100).
- **`NOT_FOUND`**: Returned when querying or mutating non-existent documents or collections.
- **`ALREADY_EXISTS`**: Returned when creating a collection with a duplicate `slug` (translates Prisma `P2002` unique constraint error).

---

## 🧪 Testing

- **Resolver Unit Tests (`tests/resolvers.test.ts`)**: 17 isolated unit tests verifying resolver queries, mutations, validation guardrails, cursor pagination, and error codes using an in-memory mock context.
- **Integration Test (`tests/integration.test.ts`)**: Verifies real database connection, schema constraints, updates, and cleanup when `DATABASE_URL` is set against PostgreSQL.

Run all tests via:
```sh
bun run sanity
```

---

## 🐳 Docker & CI/CD

- **`Dockerfile`**: Container setup based on `oven/bun:1.2-alpine`.
- **GitHub Actions (`.github/workflows/ci.yml`)**: CI workflow running `bun run sanity` on pull requests and pushes to `main`.

---

## ⚖️ Trade-offs & Future Extensions

### Trade-offs Made
1. **Schema-First Specification**: Maintained `schema/schema.graphql` separately to provide a clear, readable GraphQL API contract.
2. **Cursor Pagination Strategy**: Used composite sorting `(createdAt desc, id desc)` with UUID document cursors to prevent offset page drift and maintain consistent `O(1)` query performance.
3. **Domain Error Guardrails**: Validated input in resolver handlers before hitting Prisma to return clean, explicit GraphQL error codes.

### How I Would Extend the Design
- **Full-Text Search (FTS)**: For large document volume, replace SQL `contains` (`ILIKE`) with PostgreSQL `tsvector`/`tsquery` full-text search indexes or an external engine like Meilisearch/Elasticsearch.
- **DataLoader for Batching**: Introduce `DataLoader` to batch parent-child relations and avoid N+1 query patterns when querying nested documents across multiple collections.
- **Authentication & RBAC**: Integrate JWT/session authentication and role-based access control at the Yoga context level.
- **Soft Deletes & Audit Trails**: Add `deletedAt` soft deletion and historical document revision tracking.