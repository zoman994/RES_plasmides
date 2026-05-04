/**
 * annotator-plugins/index.js — central import point that registers
 * all 6 Sprint M-X.2 plugins on module load. Application code (and
 * tests) only need to `import './annotator-plugins'` once before
 * calling `runAnnotatorPipeline`.
 *
 * Risk §9 #7 — without this aggregator, individual plugin modules
 * would only register when their import was tree-shaken in (rare
 * for 4 structural detectors). This file forces all 6 to be
 * pulled in side-effect-only.
 */

import './structural.js';
import './common-features.js';
import './blast-ncbi-stub.js';

export { registerPlugin, getAllPlugins, getPluginById, getAvailablePlugins } from './registry.js';
