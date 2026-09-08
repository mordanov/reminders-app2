import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const logoutMiddleware: Plugin = {
  name: "logout-middleware",
  configureServer(server) {
    server.middlewares.use("/logout", (_req, res) => {
      res.statusCode = 401;
      res.setHeader("WWW-Authenticate", 'Basic realm="Reminders"');
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(logoutHtml);
    });
  },
};

const logoutHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>Выход</title>
<style>
body{font:16px system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;
justify-content:center;min-height:100vh;margin:0;background:#f8f1e5;color:#333}
h1{margin:0 0 12px;font-size:1.5rem}p{margin:0 0 20px;color:#666}
a{display:inline-block;padding:10px 22px;background:#84602b;color:#fff;
border-radius:6px;text-decoration:none;font-size:1rem}
a:hover{background:#6b4e23}
</style>
</head>
<body>
<h1>Вы вышли</h1>
<p>Нажмите «Отмена», если снова появился запрос входа.</p>
<a href="/">Войти снова</a>
</body>
</html>`;

export default defineConfig({
  plugins: [react(), logoutMiddleware],
  server: {
    proxy: {
      "/api": "http://backend:8000",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-i18n": ["i18next", "react-i18next"],
          "vendor-ui": [
            "@dnd-kit/core",
            "@dnd-kit/sortable",
            "@dnd-kit/utilities",
            "@phosphor-icons/react",
            "@radix-ui/react-dialog",
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/main.tsx",
        "src/test/**",
        "src/vite-env.d.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
