// @ts-check
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";

// The site imports the repository's runtime/, examples/ and brand/ verbatim,
// so Vite may read one level above website/.
const repo = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
	site: "https://motion-kit.dev",
	trailingSlash: "always",
	build: { format: "directory" },
	devToolbar: { enabled: false },
	vite: { server: { fs: { allow: [repo] } } },
});
