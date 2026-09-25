import 'dotenv/config';
import { defineConfig } from "prisma/config";

// prisma.config.ts varken Prisma CLI .env dosyasini kendisi okumaz; dotenv ile yuklenir.
export default defineConfig({
  schema: "prisma/schema.prisma",
});
