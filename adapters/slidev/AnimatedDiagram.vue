<!--
  SPDX-License-Identifier: MIT
  Copyright (c) 2026 Ophir Radnitz

  motion-kit · Slidev adapter (verified against Slidev 53).

  Each slide click advances one build step. The component registers its own
  clicks with the slide (the same API Slidev's ShikiMagicMove uses), so no
  `clicks:` frontmatter is needed and it composes with v-click elements.

  - Step 1 shows on arrival (its entrance plays once); clicks 1…N−1 advance.
  - Forward by one click: animates from the previous step's time to the next.
    Back or jump: seeks with no animation.
  - Overview, presenter next-preview, print/PDF/PNG export (`isPrintMode`) and
    prefers-reduced-motion: always the settled step frame, so
    `slidev export --with-clicks` writes one clean frame per click.
  - Light/dark follows Slidev's dark mode unless `theme` is set.

  Usage in a slide:

    <script setup>
    import spec from './diagrams/order-flow.json'
    </script>

    <AnimatedDiagram :spec="spec" format="16:9" locale="en" />

  Props:
    spec      scene spec (JSON) for a registered scene type, or
    scene     a ready scene object (custom scene module output)
    format    "16:9" | "4:3" | "1:1" | "9:16" | "wide" | "tall"   (default "16:9")
    locale    string (default "en")
    at        Slidev click position of the first advance (default "+1")
    intro     play the entrance up to step 1 when the slide opens (default true)
    theme     "light" | "dark" (default: follow Slidev dark mode)
    styleSpec style object (tokens); default neutral
    maxHeight CSS length; default "380px" fits under a slide title on Slidev's
              980×552 canvas. Use "100%" (with a full-height parent) for
              full-bleed diagram slides.
-->
<script setup>
import { useDarkMode, useNav, useSlideContext } from "@slidev/client";
import { computed, onMounted, onUnmounted, ref, unref, watch } from "vue";
import { renderSvg } from "../runtime/scene.mjs";
import { cssVars, normalizeStyle } from "../runtime/style.mjs";
import { createScene } from "../runtime/types/index.mjs";

const props = defineProps({
	spec: { type: Object, default: null },
	scene: { type: Object, default: null },
	format: { type: String, default: "16:9" },
	locale: { type: String, default: "en" },
	at: { type: [String, Number], default: "+1" },
	intro: { type: Boolean, default: true },
	theme: { type: String, default: undefined },
	styleSpec: { type: Object, default: null },
	maxHeight: { type: String, default: "380px" },
});

const { $clicksContext: clicks, $renderContext } = useSlideContext();
const { isPrintMode } = useNav();
const { isDark } = useDarkMode();

const scene = computed(() => props.scene ?? createScene(props.spec, { format: props.format, locale: props.locale }));
const style = computed(() => normalizeStyle(props.styleSpec ?? "neutral"));
const n = scene.value.steps.length;
const id = `mk-${scene.value.id}-${Math.random().toString(36).slice(2, 8)}`;
const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const animated = computed(() => ["slide", "presenter"].includes(unref($renderContext)) && !isPrintMode.value && !reduced);

// Register N−1 clicks (step 1 is shown on arrival).
const info = clicks && n > 1 ? clicks.calculateSince(props.at, n - 1) : null;
const stepIndex = computed(() => {
	if (!info || !clicks) return n - 1;
	return Math.min(Math.max(clicks.current - info.start + 1, 0), n - 1);
});

const t = ref(scene.value.steps[stepIndex.value].at);
let raf = 0;

function animate(from, to) {
	cancelAnimationFrame(raf);
	if (!animated.value || to <= from) {
		t.value = to;
		return;
	}
	const start = performance.now();
	const tick = (now) => {
		const v = Math.min(from + (now - start) / 1000, to);
		t.value = v;
		if (v < to) raf = requestAnimationFrame(tick);
	};
	t.value = from;
	raf = requestAnimationFrame(tick);
}

watch(stepIndex, (next, prev) => {
	const steps = scene.value.steps;
	if (next === prev + 1) animate(steps[prev].at, steps[next].at);
	else {
		cancelAnimationFrame(raf);
		t.value = steps[next].at;
	}
});

onMounted(() => {
	if (info) clicks.register(id, info);
	if (animated.value && props.intro && stepIndex.value === 0) animate(0, scene.value.steps[0].at);
});
onUnmounted(() => {
	cancelAnimationFrame(raf);
	clicks?.unregister(id);
});

const announcement = computed(() => {
	const steps = scene.value.steps;
	const i = Math.min(stepIndex.value, steps.length - 1);
	const s = steps[i];
	return `${i + 1}. ${s.detail ? `${s.label}: ${s.detail}` : s.label}`;
});
const dark = computed(() => (props.theme ? props.theme === "dark" : isDark.value));
const markup = computed(() => renderSvg(scene.value, t.value, { style: style.value, live: true, idPrefix: id }));
const vars = computed(() => `${cssVars(style.value, dark.value ? "dark" : "light")};--mk-max-h:${props.maxHeight}`);
</script>

<template>
	<figure class="mk-slidev" :style="vars" :data-mk-step="stepIndex + 1">
		<div class="mk-slidev-stage" v-html="markup" />
		<!-- Clicks advance steps; say which one, like the live player does. -->
		<div class="mk-slidev-live" role="status" aria-live="polite" aria-atomic="true">{{ announcement }}</div>
	</figure>
</template>

<style scoped>
.mk-slidev {
	position: relative;
	margin: 0;
	width: 100%;
}
.mk-slidev-live {
	position: absolute;
	width: 1px;
	height: 1px;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
}
.mk-slidev-stage :deep(svg) {
	display: block;
	width: 100%;
	height: auto;
	max-height: var(--mk-max-h, 380px);
	margin: 0 auto;
}
</style>
