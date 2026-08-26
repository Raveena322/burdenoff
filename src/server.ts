import { createYoga } from "graphql-yoga";
import { PrismaClient } from "@prisma/client";
import { schema } from "./schema.js";

const prisma = new PrismaClient();
const yoga = createYoga({ schema, graphqlEndpoint: "/graphql" });
const port = Number(process.env.PORT ?? 4000);

const server = Bun.serve({
  port,
  fetch: (request) => yoga.fetch(request, { prisma })
});

console.log(`Document Vault GraphQL API listening on http://localhost:${server.port}/graphql`);

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  server.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  server.stop();
  process.exit(0);
});