import js from "@eslint/js";
import nextConfig from "eslint-config-next";

export default [
  js.configs.recommended,
  ...nextConfig,
  {
    ignores: [
      ".next/",
      "node_modules/",
      "public/",
    ],
  },
];
