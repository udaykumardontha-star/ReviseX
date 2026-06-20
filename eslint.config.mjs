import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Enforce strict TypeScript practices
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],

      // Disallow patterns that violate architecture layering
      "no-console": ["warn", { allow: ["warn", "error"] }],

      // React best practices
      "react/no-unescaped-entities": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Code quality
      "no-var": "error",
      "prefer-const": "error",
      "eqeqeq": ["error", "always"],
    },
  },
  {
    // Allow console in scripts and DB files
    files: ["scripts/**/*.ts", "db/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
];

export default eslintConfig;
