#!/usr/bin/env node
// commit-msg hook: Conventional Commits subject line (see AGENTS.md).
import { readFileSync } from "node:fs";

const subject = readFileSync(process.argv[2], "utf8").split("\n")[0];
const ok = /^(feat|fix|docs|chore|refactor|perf|test|build|ci|style|revert)(\([\w./-]+\))?!?: \S/.test(subject) || /^(Merge|Revert|fixup!|squash!|amend!) /.test(subject);
if (!ok) {
	console.error(`commit message must follow Conventional Commits, e.g. "feat(slidev): add print mode"\n  got: ${subject}`);
	process.exit(1);
}
