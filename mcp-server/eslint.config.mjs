import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
// eslint.config.mjs uses typescript-eslint v8 flat config API

export default tseslint.config(eslint.configs.recommended, ...tseslint.configs.recommended, {
  rules: {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  },
});
