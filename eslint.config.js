import nextConfig from "eslint-config-next/core-web-vitals";

const config = [
  ...nextConfig,
  {
    rules: {
      // TypeScript already reports unused values; allow intentionally unused `_` arguments.
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    ignores: [".next/**", "out/**", "build/**", "public/**", "next-env.d.ts", "*.tsbuildinfo"],
  },
];

export default config;
