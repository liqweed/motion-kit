<!--
  motion-kit · Slidev adapter.

  Each slide click advances one build step. Moving forward by one click animates
  from the previous step's time to the next; going back or jumping seeks with no
  animation. In overview / print / export (and with prefers-reduced-motion) it
  always shows the settled step frame, so `slidev export --with-clicks` gets one
  clean frame per click.

  Usage in a slide (only documented Slidev globals are used, passed as props):

    ---
    clicks: 6            # number of steps − 1 (step 1 shows on arrival)
    ---
    <script setup>
    import spec from './diagrams/order-flow.json'
    </script>

    <AnimatedDiagram :spec="spec" :clicks="$clicks" :context="$renderContext"
                     format="16:9" locale="en" />

  Props:
    spec      scene spec (JSON) for a registered scene type, or
    scene     a ready scene object (custom scene modules)
    format    "16:9" | "4:3" | "1:1" | "9:16" | "wide" | "tall"   (default "16:9")
    locale    string (default "en")
    clicks    $clicks — current click count on this slide
    context   $renderContext — "slide" | "presenter" | "overview" | "previewNext" | ...
    offset    clicks used by other elements before the diagram starts (default 0)
    intro     play the entrance up to step 1 when the slide opens (default true)
    theme     "light" | "dark" | undefined (auto: html.dark class)
    styleSpec style object (tokens); default neutral
-->
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { renderSvg } from "../runtime/scene.mjs";
import { cssVars, normalizeStyle } from "../runtime/style.mjs";
import { createScene } from "../runtime/types/index.mjs";

const props = defineProps({
	spec: { type: Object, default: null },
	scene: { type: Object, default: null },
	format: { type: String, default: "16:9" },
	locale: { type: String, default: "en" },
	clicks: { type: Number, default: 0 },
	context: { type: String, default: "slide" },
	offset: { type: Number, default: 0 },
	intro: { type: Boolean, default: true },
	theme: { type: String, default: undefined },
	styleSpec: { type: Object, default: null },
});

const scene = computed(() => props.scene ?? createScene(props.spec, { format: props.format, locale: props.locale }));
const style = computed(() => normalizeStyle(props.styleSpec ?? "neutral"));
const live = computed(() => props.context === "slide" || props.context === "presenter");
const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const stepIndex = computed(() => Math.min(Math.max(props.clicks - props.offset, 0), scene.value.steps.length - 1));
const t = ref(live.value && props.intro && !reduced ? 0 : scene.value.steps[stepIndex.value].at);
const dark = ref(false);
let raf = 0;

function animate(from, to) {
	cancelAnimationFrame(raf);
	if (!live.value || reduced || to <= from) {
		t.value = to;
		return;
	}
	const start = performance.now();
	const span = to - from;
	const tick = (now) => {
		const v = Math.min(from + (now - start) / 1000, to);
		t.value = v;
		if (v < to) raf = requestAnimationFrame(tick);
	};
	t.value = from;
	raf = requestAnimationFrame(tick);
	return span;
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
	dark.value = props.theme ? props.theme === "dark" : document.documentElement.classList.contains("dark");
	if (live.value && props.intro && !reduced) animate(0, scene.value.steps[stepIndex.value].at);
});
onBeforeUnmount(() => cancelAnimationFrame(raf));

const markup = computed(() => renderSvg(scene.value, t.value, { style: style.value, live: true, idPrefix: `${scene.value.id}-${props.clicks}` }));
const vars = computed(() => cssVars(style.value, dark.value ? "dark" : "light"));
</script>

<template>
	<figure class="mk-slidev" :style="vars">
		<div class="mk-slidev-stage" v-html="markup" />
	</figure>
</template>

<style scoped>
.mk-slidev {
	margin: 0;
	width: 100%;
}
.mk-slidev-stage :deep(svg) {
	display: block;
	width: 100%;
	height: auto;
	max-height: 100%;
}
</style>
