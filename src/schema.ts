import { createGraphQLError, createSchema } from "graphql-yoga";
import { GraphQLScalarType, Kind } from "graphql";
import type { Prisma, Document as PrismaDocument, Collection as PrismaCollection } from "@prisma/client";
import type { Context } from "./context.js";
import { readFileSync } from "node:fs";

const schemaText = readFileSync(new URL("../schema/schema.graphql", import.meta.url), "utf8");

type DocumentArgs = { collectionId?: string; search?: string; isArchived?: boolean; take?: number; cursor?: string };
type CollectionDocumentArgs = { take?: number; cursor?: string };
type CreateCollectionArgs = { input: { name: string; slug: string } };
type CreateDocumentArgs = { input: { title: string; content: string; tags?: string[]; collectionId: string } };
type UpdateDocumentArgs = { id: string; input: { title?: string; content?: string; tags?: string[]; isArchived?: boolean } };
type IdArgs = { id: string };
type MoveDocumentArgs = { id: string; collectionId: string };
type Connection = { edges: Array<{ node: PrismaDocument; cursor: string }>; pageInfo: { hasNextPage: boolean; endCursor: string | null } };

const invalid = (message: string): never => {
  throw createGraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
};

const notFound = (message: string): never => {
  throw createGraphQLError(message, { extensions: { code: "NOT_FOUND" } });
};

const conflict = (message: string): never => {
  throw createGraphQLError(message, { extensions: { code: "ALREADY_EXISTS" } });
};

const requireText = (value: string, field: string): string => {
  if (value.trim().length === 0) invalid(`${field} cannot be empty`);
  return value;
};

const validateSlug = (slug: string): string => {
  const trimmed = slug.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) {
    invalid("slug must contain lowercase letters, numbers, and single hyphens");
  }
  return trimmed;
};

const validateTake = (take: number | undefined): number => {
  const value = take ?? 20;
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    invalid("take must be an integer between 1 and 100");
  }
  return value;
};

const handlePrismaError = (error: unknown): never => {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: string }).code;
    if (code === "P2002") {
      const meta = (error as { meta?: { target?: string[] } }).meta;
      const target = meta?.target?.join(", ") ?? "slug";
      conflict(`A collection with this ${target} already exists`);
    }
    if (code === "P2025") {
      notFound("Requested record was not found");
    }
    if (code === "P2003") {
      invalid("Referenced parent collection does not exist");
    }
  }
  throw error;
};

const connection = async (prisma: Context["prisma"], args: DocumentArgs): Promise<Connection> => {
  const take = validateTake(args.take);
  const where: Prisma.DocumentWhereInput = {};

  if (args.collectionId) where.collectionId = args.collectionId;
  if (args.isArchived !== undefined) where.isArchived = args.isArchived;
  if (args.search?.trim()) {
    const term = args.search.trim();
    where.OR = [
      { title: { contains: term, mode: "insensitive" } },
      { content: { contains: term, mode: "insensitive" } }
    ];
  }

  try {
    const rows = await prisma.document.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(args.cursor ? { skip: 1, cursor: { id: args.cursor } } : {})
    });
    const pageRows = rows.slice(0, take);
    return {
      edges: pageRows.map((node) => ({ node, cursor: node.id })),
      pageInfo: {
        hasNextPage: rows.length > take,
        endCursor: pageRows.at(-1)?.id ?? null
      }
    };
  } catch (error) {
    throw handlePrismaError(error);
  }
};

export const schema = createSchema<Context>({
  typeDefs: schemaText,
  resolvers: {
    DateTime: new GraphQLScalarType({
      name: "DateTime",
      description: "ISO-8601 date-time scalar",
      serialize: (value: unknown) => {
        if (value instanceof Date) return value.toISOString();
        if (typeof value === "string" || typeof value === "number") return new Date(value).toISOString();
        return String(value);
      },
      parseValue: (value: unknown) => {
        const d = new Date(String(value));
        if (isNaN(d.getTime())) invalid("Invalid DateTime scalar format");
        return d;
      },
      parseLiteral: (ast) => {
        if (ast.kind === Kind.STRING) {
          const d = new Date(ast.value);
          if (!isNaN(d.getTime())) return d;
        }
        return null;
      }
    }),
    Query: {
      collections: (_parent: unknown, _args: unknown, context: Context) => {
        return context.prisma.collection.findMany({ orderBy: { createdAt: "desc" } });
      },
      collection: (_parent: unknown, args: IdArgs, context: Context) => {
        return context.prisma.collection.findUnique({ where: { id: args.id } });
      },
      documents: (_parent: unknown, args: DocumentArgs, context: Context) => {
        return connection(context.prisma, args);
      }
    },
    Collection: {
      documents: (parent: PrismaCollection, args: CollectionDocumentArgs, context: Context) => {
        return connection(context.prisma, { collectionId: parent.id, ...args });
      }
    },
    Mutation: {
      createCollection: async (_parent: unknown, args: CreateCollectionArgs, context: Context) => {
        const name = requireText(args.input.name, "name");
        const slug = validateSlug(args.input.slug);
        try {
          return await context.prisma.collection.create({ data: { name, slug } });
        } catch (error) {
          throw handlePrismaError(error);
        }
      },
      createDocument: async (_parent: unknown, args: CreateDocumentArgs, context: Context) => {
        const title = requireText(args.input.title, "title");
        const content = requireText(args.input.content, "content");
        const col = await context.prisma.collection.findUnique({ where: { id: args.input.collectionId } });
        if (!col) {
          notFound(`Collection with id '${args.input.collectionId}' not found`);
        }
        try {
          return await context.prisma.document.create({
            data: {
              title,
              content,
              tags: args.input.tags ?? [],
              collectionId: args.input.collectionId
            }
          });
        } catch (error) {
          throw handlePrismaError(error);
        }
      },
      updateDocument: async (_parent: unknown, args: UpdateDocumentArgs, context: Context) => {
        const data: Prisma.DocumentUpdateInput = {};
        if (args.input.title !== undefined) data.title = requireText(args.input.title, "title");
        if (args.input.content !== undefined) data.content = requireText(args.input.content, "content");
        if (args.input.tags !== undefined) data.tags = args.input.tags;
        if (args.input.isArchived !== undefined) data.isArchived = args.input.isArchived;

        if (Object.keys(data).length === 0) {
          invalid("At least one field must be provided to update");
        }

        try {
          return await context.prisma.document.update({ where: { id: args.id }, data });
        } catch (error) {
          throw handlePrismaError(error);
        }
      },
      deleteDocument: async (_parent: unknown, args: IdArgs, context: Context) => {
        try {
          await context.prisma.document.delete({ where: { id: args.id } });
          return true;
        } catch (error) {
          throw handlePrismaError(error);
        }
      },
      moveDocument: async (_parent: unknown, args: MoveDocumentArgs, context: Context) => {
        const col = await context.prisma.collection.findUnique({ where: { id: args.collectionId } });
        if (!col) {
          notFound(`Target collection with id '${args.collectionId}' not found`);
        }
        try {
          return await context.prisma.document.update({
            where: { id: args.id },
            data: { collectionId: args.collectionId }
          });
        } catch (error) {
          throw handlePrismaError(error);
        }
      }
    }
  }
});