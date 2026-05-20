import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: "es6" },
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: "es2022",
      },
    }),
  ],
  test: {
    include: ["src/*.integration.test.ts", "src/**/*.integration.test.ts"],
    globalSetup: ["src/test/integration-global-setup.ts"],
    setupFiles: ["src/test/integration-setup.ts"],
    // Integration-тесты используют одну реальную БД, поэтому отключаем параллелизм.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
