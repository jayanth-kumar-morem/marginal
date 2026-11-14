import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.next/**",
      "target/**",
      "contracts/**",
      // circom's generated witness code, and the two tools that only ever run from a shell.
      "circuits/build/**",
      "circuits/*.mjs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["**/*.ts", "**/*.tsx"], rules: { "@typescript-eslint/no-explicit-any": "error" } },
  // `apps/web/src/components/ui/` is vendored third-party code: shadcn/ui, Magic UI and 21st.dev
  // components, installed by their own CLIs and kept as they ship. It is not ours to rewrite, and
  // editing it would make the next upstream copy a merge instead of a copy — so the two rules it
  // breaks are relaxed **for those files only**. Everything we write, `.ts` and `.tsx` alike, keeps
  // the strict set above.
  {
    files: ["apps/web/src/components/ui/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "no-empty": "off",
    },
  },
);
