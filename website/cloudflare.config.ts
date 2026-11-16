import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "motion-kit-dev",
		compatibilityDate: "2026-11-01",
		assets: {
			notFoundHandling: "404-page",
		},
	},
});
