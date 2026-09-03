import { dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { FlatCompat } from "@eslint/eslintrc";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const nextConfigPath = dirname(require.resolve("eslint-config-next/package.json"));

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: nextConfigPath,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@next/next/no-html-link-for-pages": "warn",
      "@typescript-eslint/no-require-imports": "off",
      "react/no-unescaped-entities": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "server/**",
      "scratch/**",
      "public/**",
    ],
  },
];

export default eslintConfig;
