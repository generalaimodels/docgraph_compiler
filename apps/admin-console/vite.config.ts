import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    port: Number(process.env.ADMIN_CONSOLE_PORT ?? 5173),
    proxy: {
      "/v1": {
        target: `http://localhost:${process.env.API_PORT ?? 3000}`,
        changeOrigin: true
      }
    }
  }
});
