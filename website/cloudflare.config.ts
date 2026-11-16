import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "motion-kit-dev",
		compatibilityDate: "2026-11-01",
		domains: ["motion-kit.dev"],
		assets: {
			notFoundHandling: "404-page",
		},
	},
});
