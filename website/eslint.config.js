import pluginVue from "eslint-plugin-vue";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
  ...pluginVue.configs["flat/essential"],
  eslintConfigPrettier,
  {
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
      },
    },
    rules: {
      // Route-level views (Home, Callback, Results) are conventionally single-word.
      "vue/multi-word-component-names": "off",
    },
  },
  {
    ignores: ["dist/**"],
  },
];
