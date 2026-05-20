import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
    test: {
        environment: "node",
        include: ["lib/**/__tests__/**/*.test.ts", "app/**/__tests__/**/*.test.ts"],
        exclude: ["node_modules", ".next", ".worktrees"],
        testTimeout: 10_000,
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "."),
        },
    },
});
