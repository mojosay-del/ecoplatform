// @ts-check

import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import { defineConfig } from "eslint/config";
import jsxA11y from "eslint-plugin-jsx-a11y";
import noUnsanitized from "eslint-plugin-no-unsanitized";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

function rulesAsWarnings(rules) {
  return Object.fromEntries(
    Object.entries(rules).map(([ruleName, ruleConfig]) => {
      if (Array.isArray(ruleConfig)) return [ruleName, ["warn", ...ruleConfig.slice(1)]];
      if (ruleConfig === "off" || ruleConfig === 0) return [ruleName, ruleConfig];
      return [ruleName, "warn"];
    }),
  );
}

export default defineConfig([
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/dist/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/blob-report/**",
      "**/*.tsbuildinfo",
      "apps/api/generated/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: [
          "./apps/api/tsconfig.eslint.json",
          "./apps/web/tsconfig.json",
          "./packages/shared/tsconfig.eslint.json",
        ],
        tsconfigRootDir,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-floating-promises": ["error", { ignoreIIFE: true, ignoreVoid: true }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
      "jsx-a11y": jsxA11y,
      "no-unsanitized": noUnsanitized,
      react,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      next: {
        rootDir: ["apps/web/"],
      },
      react: {
        version: "detect",
      },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...rulesAsWarnings(jsxA11y.configs.recommended.rules),
      "@next/next/no-html-link-for-pages": "off",
      // Отключено осознанно: у приложения СВОЙ конвейер оптимизации картинок —
      // sharp генерит AVIF/WebP-варианты на сервере, а `preferredFileAssetImageUrl`
      // отдаёт уже готовый оптимизированный вариант из S3. Прогонять их через
      // next/image (/_next/image) — двойная оптимизация: лишняя нагрузка на
      // web-контейнер и, по предупреждению самого Next, доп. расходы провайдера.
      // Поэтому `<img>` на готовые S3-URL здесь корректен, а не «медленный LCP».
      "@next/next/no-img-element": "off",
      "no-unsanitized/method": "error",
      "no-unsanitized/property": "error",
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/rules-of-hooks": "error",
      "react/no-danger": "error",
    },
  },
  {
    files: ["**/*.{test,spec}.ts", "**/*.integration.test.ts", "apps/api/src/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
]);
