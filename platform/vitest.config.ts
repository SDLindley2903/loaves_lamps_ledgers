import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: false,
    environment: "node",
    include: ["packages/**/*.test.ts", "products/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "products/*/src/**/*.ts"],
      exclude: ["packages/*/src/**/index.ts", "products/*/src/**/index.ts"],
    },
  },
});
