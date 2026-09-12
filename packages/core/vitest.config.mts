import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Vitest 5 clears spies before each test. The annotation tests assert on calls that
    // decorators make while the class body is evaluated, which happens at import time.
    clearMocks: false,
    typecheck: {
      enabled: true,
      include: ["**/src/**/*.test.ts", "**/test-stage3/**/*.test.ts"],
    },
  },
});
