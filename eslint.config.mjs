import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    "playwright-report/**",
    "test-results/**",
    // 物资追溯是独立零依赖 Node 子应用，使用 CommonJS，并由自身 check/test 链验证。
    "apps/wuzhi-trace/**",
  ]),
]);
