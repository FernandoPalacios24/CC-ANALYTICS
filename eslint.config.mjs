import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // CC Analytics carga datos remotos y suscripciones de Supabase desde
      // efectos controlados. Estas actualizaciones son intencionales.
      "react-hooks/set-state-in-effect": "off",
      // La presentación para TV es una ruta independiente y usa navegación
      // completa para volver al panel principal.
      "@next/next/no-html-link-for-pages": "off",
      // Los nombres de módulo se utilizan como datos comerciales locales.
      "@next/next/no-assign-module-variable": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
