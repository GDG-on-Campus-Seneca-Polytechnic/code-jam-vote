import { bindings, defineConfig, exports } from "cf/config";

export default defineConfig({
	worker: {
		name: "gdg-code-jam-vote",
		compatibilityDate: "2026-09-01",
		entrypoint: "src/worker.js",
		env: {
			POLLS: bindings.durableObject({
				worker: "gdg-code-jam-vote",
				exportName: "Poll",
			}),
		},
		exports: {
			Poll: exports.durableObject({
				storage: "sqlite",
			}),
		},
	},
});
