// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/** The runtime, flat, handed to custom scene modules as `kit` (like the CLI does). DOM-free. */
import * as bars from "../../../runtime/bars.mjs";
import * as cells from "../../../runtime/cells.mjs";
import * as code from "../../../runtime/code.mjs";
import * as connectors from "../../../runtime/connectors.mjs";
import * as iso from "../../../runtime/iso.mjs";
import * as motion from "../../../runtime/motion.mjs";
import * as scene from "../../../runtime/scene.mjs";
import * as style from "../../../runtime/style.mjs";
import * as svg from "../../../runtime/svg.mjs";
import * as wrap from "../../../runtime/wrap.mjs";

export const KIT = Object.freeze({ ...motion, ...svg, ...iso, ...connectors, ...bars, ...cells, ...code, ...style, ...scene, ...wrap });
