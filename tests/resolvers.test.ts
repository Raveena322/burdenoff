import { describe, expect, it, beforeEach } from "vitest";
import { createYoga } from "graphql-yoga";
import { schema } from "../src/schema.js";

type CollectionRecord = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
};

type DocumentRecord = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  collectionId: string;
  isArchived: boolean;
  createdAt: Date;
};

describe("Document Vault Resolvers", () => {
  let collections: CollectionRecord[] = [];
  let documents: DocumentRecord[] = [];

  beforeEach(() => {
    collections = [
      { id: "col-1", name: "Engineering", slug: "engineering", createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: "col-2", name: "Product", slug: "product", createdAt: new Date("2026-01-02T00:00:00Z") }
    ];
    documents = [
      { id: "doc-1", title: "Architecture Spec", content: "Bun and GraphQL Yoga design", tags: ["tech", "api"], collectionId: "col-1", isArchived: false, createdAt: new Date("2026-01-03T00:00:00Z") },
      { id: "doc-2", title: "Product Roadmap", content: "Q3 feature planning", tags: ["roadmap"], collectionId: "col-2", isArchived: false, createdAt: new Date("2026-01-04T00:00:00Z") },
      { id: "doc-3", title: "Archived Notes", content: "Old system specs", tags: ["legacy"], collectionId: "col-1", isArchived: true, createdAt: new Date("2026-01-05T00:00:00Z") }
    ];
  });

  const mockContext = {
    prisma: {
      collection: {
        findMany: async () => [...collections].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
        findUnique: async ({ where }: { where: { id?: string; slug?: string } }) => {
          if (where.id) return collections.find((c) => c.id === where.id) ?? null;
          if (where.slug) return collections.find((c) => c.slug === where.slug) ?? null;
          return null;
        },
        create: async ({ data }: { data: { name: string; slug: string } }) => {
          if (collections.some((c) => c.slug === data.slug)) {
            const err = new Error("Unique constraint failed on field: slug");
            (err as unknown as { code: string; meta: { target: string[] } }).code = "P2002";
            (err as unknown as { code: string; meta: { target: string[] } }).meta = { target: ["slug"] };
            throw err;
          }
          const created: CollectionRecord = {
            id: `col-${collections.length + 1}`,
            name: data.name,
            slug: data.slug,
            createdAt: new Date()
          };
          collections.push(created);
          return created;
        }
      },
      document: {
        findMany: async (args: { where?: { collectionId?: string; isArchived?: boolean; OR?: Array<{ title?: { contains: string }; content?: { contains: string } }> }; take?: number; cursor?: { id: string }; skip?: number }) => {
          let list = [...documents];
          if (args.where?.collectionId) list = list.filter((d) => d.collectionId === args.where?.collectionId);
          if (args.where?.isArchived !== undefined) list = list.filter((d) => d.isArchived === args.where?.isArchived);
          if (args.where?.OR) {
            const term = args.where.OR[0]?.title?.contains?.toLowerCase() ?? "";
            list = list.filter((d) => d.title.toLowerCase().includes(term) || d.content.toLowerCase().includes(term));
          }
          list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          if (args.cursor) {
            const idx = list.findIndex((d) => d.id === args.cursor?.id);
            if (idx !== -1) list = list.slice(idx + (args.skip ?? 0));
          }
          if (args.take) list = list.slice(0, args.take);
          return list;
        },
        create: async ({ data }: { data: { title: string; content: string; tags: string[]; collectionId: string } }) => {
          const created: DocumentRecord = {
            id: `doc-${documents.length + 1}`,
            title: data.title,
            content: data.content,
            tags: data.tags,
            collectionId: data.collectionId,
            isArchived: false,
            createdAt: new Date()
          };
          documents.push(created);
          return created;
        },
        update: async ({ where, data }: { where: { id: string }; data: Partial<DocumentRecord> }) => {
          const doc = documents.find((d) => d.id === where.id);
          if (!doc) {
            const err = new Error("Record not found");
            (err as unknown as { code: string }).code = "P2025";
            throw err;
          }
          Object.assign(doc, data);
          return doc;
        },
        delete: async ({ where }: { where: { id: string } }) => {
          const idx = documents.findIndex((d) => d.id === where.id);
          if (idx === -1) {
            const err = new Error("Record not found");
            (err as unknown as { code: string }).code = "P2025";
            throw err;
          }
          documents.splice(idx, 1);
          return documents;
        }
      }
    }
  };

  const yoga = createYoga({ schema: schema as never, context: () => mockContext });

  const query = async (gql: string, variables?: Record<string, unknown>) => {
    const res = await yoga.fetch("http://localhost/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: gql, variables })
    });
    return res.json();
  };

  describe("Queries", () => {
    it("fetches collections", async () => {
      const res = await query("query { collections { id name slug } }");
      expect(res.data?.collections).toHaveLength(2);
    });

    it("fetches a single collection with nested documents", async () => {
      const res = await query("query($id: ID!) { collection(id: $id) { id name documents { edges { node { id title } } pageInfo { hasNextPage } } } }", { id: "col-1" });
      expect(res.data?.collection?.name).toBe("Engineering");
      expect(res.data?.collection?.documents?.edges).toHaveLength(2);
    });

    it("searches documents by substring match", async () => {
      const res = await query("query($search: String) { documents(search: $search) { edges { node { id title } } } }", { search: "Roadmap" });
      expect(res.data?.documents?.edges).toHaveLength(1);
      expect(res.data?.documents?.edges[0].node.title).toBe("Product Roadmap");
    });

    it("filters documents by archived state", async () => {
      const res = await query("query { documents(isArchived: true) { edges { node { id title isArchived } } } }");
      expect(res.data?.documents?.edges).toHaveLength(1);
      expect(res.data?.documents?.edges[0].node.title).toBe("Archived Notes");
    });
  });

  describe("Mutations", () => {
    it("creates a new collection", async () => {
      const res = await query("mutation { createCollection(input: { name: \"Design\", slug: \"design-system\" }) { id name slug } }");
      expect(res.data?.createCollection?.name).toBe("Design");
      expect(res.data?.createCollection?.slug).toBe("design-system");
    });

    it("rejects empty collection name with BAD_USER_INPUT", async () => {
      const res = await query("mutation { createCollection(input: { name: \"   \", slug: \"valid-slug\" }) { id } }");
      expect(res.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    });

    it("rejects malformed collection slug with BAD_USER_INPUT", async () => {
      const res = await query("mutation { createCollection(input: { name: \"Valid Name\", slug: \"Invalid Slug!\" }) { id } }");
      expect(res.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    });

    it("rejects duplicate slug with ALREADY_EXISTS", async () => {
      const res = await query("mutation { createCollection(input: { name: \"Engineering Duplicate\", slug: \"engineering\" }) { id } }");
      expect(res.errors?.[0]?.extensions?.code).toBe("ALREADY_EXISTS");
    });

    it("creates a document successfully", async () => {
      const res = await query("mutation { createDocument(input: { title: \"New Doc\", content: \"Content body\", collectionId: \"col-1\", tags: [\"test\"] }) { id title tags } }");
      expect(res.data?.createDocument?.title).toBe("New Doc");
      expect(res.data?.createDocument?.tags).toEqual(["test"]);
    });

    it("rejects empty document title with BAD_USER_INPUT", async () => {
      const res = await query("mutation { createDocument(input: { title: \"  \", content: \"Valid content\", collectionId: \"col-1\" }) { id } }");
      expect(res.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    });

    it("rejects empty document content with BAD_USER_INPUT", async () => {
      const res = await query("mutation { createDocument(input: { title: \"Valid Title\", content: \"\", collectionId: \"col-1\" }) { id } }");
      expect(res.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    });

    it("rejects document creation with non-existent collection with NOT_FOUND", async () => {
      const res = await query("mutation { createDocument(input: { title: \"Doc\", content: \"Body\", collectionId: \"non-existent\" }) { id } }");
      expect(res.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
    });

    it("updates a document successfully", async () => {
      const res = await query("mutation { updateDocument(id: \"doc-1\", input: { title: \"Updated Architecture\", isArchived: true }) { id title isArchived } }");
      expect(res.data?.updateDocument?.title).toBe("Updated Architecture");
      expect(res.data?.updateDocument?.isArchived).toBe(true);
    });

    it("rejects update with empty input payload with BAD_USER_INPUT", async () => {
      const res = await query("mutation { updateDocument(id: \"doc-1\", input: {}) { id } }");
      expect(res.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    });

    it("deletes a document successfully", async () => {
      const res = await query("mutation { deleteDocument(id: \"doc-1\") }");
      expect(res.data?.deleteDocument).toBe(true);
    });

    it("moves a document to another collection", async () => {
      const res = await query("mutation { moveDocument(id: \"doc-1\", collectionId: \"col-2\") { id collectionId } }");
      expect(res.data?.moveDocument?.collectionId).toBe("col-2");
    });

    it("rejects moving document to non-existent collection with NOT_FOUND", async () => {
      const res = await query("mutation { moveDocument(id: \"doc-1\", collectionId: \"invalid-col\") { id } }");
      expect(res.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
    });
  });
});