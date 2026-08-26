# Burdenoff Document Vault — GraphQL API

A clean, production-grade schema-first GraphQL API built with **Bun**, **TypeScript** (strict mode, zero `any`), **GraphQL Yoga**, **PostgreSQL**, and **Prisma**.

---

## 🚀 One-Command Quickstart

Ensure **Docker** and **Bun** are installed on your system.

```sh
docker compose up -d && bun install && bun run gendb && bun run db:migrate --name init && bun run dev
```

The GraphQL server and interactive GraphiQL playground will be live at:
👉 **`http://localhost:4000/graphql`**

---

## 🛠️ Scripts & Commands

- **`bun run dev`** — Start development server with hot reloading (`bun --watch src/server.ts`)
- **`bun run sanity`** — Run linting, typechecking, and tests in one single command (`lint` + `typecheck` + `test`)
- **`bun run test`** — Execute Vitest test suite
- **`bun run typecheck`** — Strict TypeScript type checking (`tsc --noEmit`)
- **`bun run lint`** — Run ESLint rules
- **`bun run gendb`** — Generate Prisma Client code (`prisma generate`)
- **`bun run db:migrate`** — Execute Prisma database migrations (`prisma migrate dev`)

---

## 📐 Domain Schema Overview

### Data Models
- **`Collection`**: `id` (UUID), `name`, `slug` (unique), `createdAt`
- **`Document`**: `id` (UUID), `title`, `content`, `tags` (string array), `collectionId`, `isArchived` (boolean), `createdAt`

### Required Operations

#### Queries
- `collections`: Fetch all collections sorted by creation time (`createdAt desc`).
- `collection(id: ID!)`: Fetch a single collection with nested cursor-paginated `documents`.
- `documents(collectionId: ID, search: String, isArchived: Boolean, take: Int = 20, cursor: ID)`: Query documents with substring search on `title` or `content`, filter by collection or `isArchived`, and cursor-based pagination.

#### Mutations
- `createCollection(input: CreateCollectionInput!)`: Create a collection with name & slug validation.
- `createDocument(input: CreateDocumentInput!)`: Create a document with title, content, and parent collection validation.
- `updateDocument(id: ID!, input: UpdateDocumentInput!)`: Update document properties.
- `deleteDocument(id: ID!)`: Delete a document by ID.
- `moveDocument(id: ID!, collectionId: ID!)`: Relocate a document to a different collection.

---

## 🛡️ Input Validation & Error Handling

All client errors and invalid states return structured GraphQL errors with explicit error extensions rather than unhandled 500 internal server errors:
- **`BAD_USER_INPUT`**: Thrown for empty/whitespace titles, empty/whitespace contents, malformed slugs (must match `^[a-z0-9]+(?:-[a-z0-9]+)*$`), or invalid `take` range (1 to 100).
- **`NOT_FOUND`**: Thrown when referencing or mutating non-existent documents or parent collections.
- **`ALREADY_EXISTS`**: Thrown when attempting to create a collection with a duplicate `slug` (handling Prisma's `P2002` unique constraint).

---

## 🧪 Testing

- **Unit Tests (`tests/resolvers.test.ts`)**: 17 isolated unit tests verifying resolver execution, schema validation, query filters, search, edge cases, error codes, and cursor pagination using an in-memory mock context.
- **Integration Tests (`tests/integration.test.ts`)**: Database integration test verifying real PostgreSQL connection, table creation, foreign keys, searching, and record cleanup when `DATABASE_URL` is set.

Run all tests via:
```sh
bun run sanity
```

---

## 🐳 Docker & CI/CD

- **`Dockerfile`**: Multi-stage container build based on `oven/bun:1.2-alpine`.
- **GitHub Actions (`.github/workflows/ci.yml`)**: Automated workflow running `bun run sanity` on pull requests and pushes to `main`.

---

## ⚖️ Trade-offs & Future Extensions

### Architectural Trade-offs
1. **Schema-First Approach**: Kept GraphQL schema in a separate `schema/schema.graphql` file for clear specification and clean separation from TypeScript resolver logic.
2. **Cursor Pagination Strategy**: Used deterministic sorting `(createdAt desc, id desc)` with UUID document ID cursors. This avoids offset pagination performance degrades on large datasets.
3. **Domain Error Guardrails**: Validated input in domain code before calling Prisma to return clear GraphQL error codes (`BAD_USER_INPUT`, `NOT_FOUND`, `ALREADY_EXISTS`).

### How I Would Extend the Design
- **Full-Text Search (FTS)**: For high-volume documents, replace SQL `ILIKE` / `contains` substring matches with PostgreSQL `tsvector` / `tsquery` full-text search indexes or an external search engine (e.g., Elasticsearch / Meilisearch).
- **DataLoader for Batching**: Introduce DataLoader instances for parent-child relationship resolution to prevent N+1 query overhead when fetching collections with nested documents.
- **Authentication & RBAC**: Add JWT / Session authentication and scoped collection access rules at the context / resolver boundary.
- **Soft Deletion & Audit Logs**: Add soft deletion (`deletedAt`) and historical revision tracking for document version history.