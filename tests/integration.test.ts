import { describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

describe("PostgreSQL Integration Test", () => {
  it.runIf(Boolean(process.env.DATABASE_URL))("performs CRUD operations on Dockerized PostgreSQL", async () => {
    const prisma = new PrismaClient();
    await expect(prisma.$queryRaw`SELECT 1`).resolves.toBeDefined();

    // Clean up test data if exists
    await prisma.document.deleteMany({ where: { title: { startsWith: "[Test Integration]" } } });
    await prisma.collection.deleteMany({ where: { slug: { startsWith: "test-int-" } } });

    // 1. Create collections
    const col1 = await prisma.collection.create({
      data: { name: "Integration Test Col 1", slug: `test-int-1-${Date.now()}` }
    });
    const col2 = await prisma.collection.create({
      data: { name: "Integration Test Col 2", slug: `test-int-2-${Date.now()}` }
    });
    expect(col1.id).toBeDefined();
    expect(col2.id).toBeDefined();

    // 2. Create document
    const doc = await prisma.document.create({
      data: {
        title: "[Test Integration] First Document",
        content: "Testing GraphQL and Prisma against PostgreSQL",
        tags: ["integration", "postgres"],
        collectionId: col1.id
      }
    });
    expect(doc.id).toBeDefined();

    // 3. Move document
    const moved = await prisma.document.update({
      where: { id: doc.id },
      data: { collectionId: col2.id }
    });
    expect(moved.collectionId).toBe(col2.id);

    // 4. Substring Search
    const searchResults = await prisma.document.findMany({
      where: {
        title: { contains: "First Document", mode: "insensitive" }
      }
    });
    expect(searchResults.length).toBeGreaterThanOrEqual(1);

    // Clean up
    await prisma.document.delete({ where: { id: doc.id } });
    await prisma.collection.delete({ where: { id: col1.id } });
    await prisma.collection.delete({ where: { id: col2.id } });

    await prisma.$disconnect();
  });
});