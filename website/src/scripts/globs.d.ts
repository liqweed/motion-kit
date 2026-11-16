// Vite's import.meta.glob, declared minimally so the root typecheck (which does not load vite/client) can read the site scripts.
interface ImportMeta {
	glob(pattern: string | string[], options?: { query?: string; import?: string; eager?: boolean }): Record<string, () => Promise<any>>;
}
