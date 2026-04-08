<script setup lang="ts">
// @ts-nocheck
import { ref, computed } from 'vue';
import {
  CATEGORIES,
  SUBMISSIONS,
  NODES,
  FUNCTIONS,
  HACK_MATRIX,
  HACK_COLS,
  NODE_W,
  NODE_H,
  GAP_Y,
  SUB_NODE_W,
  SUB_NODE_H,
  SUB_GAP,
  FLOW,
} from '../data/gemma-architecture';

function generateId() { return Math.random().toString(36).substr(2,9); }

function loadNotes() {
  try {
    if (typeof localStorage === 'undefined') return {};
    return JSON.parse(localStorage.getItem('gemma-explorer-notes') || '{}');
  }
  catch { return {}; }
}

const selectedNodeId = ref(null);
const viewSubmission = ref('e4b');
const compareSubmission = ref('');
const detailTab = ref('learn');
const search = ref('');
const userNotes = ref(typeof localStorage !== 'undefined' ? loadNotes() : {});
const view = ref('flow');

const categories = CATEGORIES;
const submissions = SUBMISSIONS;

const nodeMap = {};
NODES.forEach(n => nodeMap[n.id] = n);

const selectedNode = computed(() => nodeMap[selectedNodeId.value] || null);

const layout = computed(() => {
  const nodes = [];
  const arrows = [];
  const blocks = [];
  const skips = [];
  let y = 20;
  const cx = 230;
  let prevMainId = null;
  let prevMainBottom = 0;
  let pleY = 0;
  let blockTop = 0;
  let blockBot = 0;

  for (const item of FLOW) {
    if (item === '__sep__') { y += 30; prevMainId = null; continue; }
    if (typeof item === 'string') {
      const nd = nodeMap[item];
      if (!nd) continue;
      const x = cx - NODE_W/2;
      nodes.push({ ...nd, x, y, w:NODE_W, h:NODE_H });
      if (item === 'ple') pleY = y + NODE_H/2;
      if (prevMainId) {
        arrows.push({ id:prevMainId+'->'+item, x1:cx, y1:prevMainBottom, x2:cx, y2:y });
      }
      prevMainId = item;
      prevMainBottom = y + NODE_H;
      y += NODE_H + GAP_Y;
    } else if (item.block) {
      const blockNd = nodeMap[item.block];
      if (!blockNd) continue;
      const blockStartY = y;
      const blockX = cx - NODE_W/2 - 20;
      y += 22;
      const subNodes = [];
      for (const childId of item.children) {
        const cnd = nodeMap[childId];
        if (!cnd) continue;
        const sx = cx - SUB_NODE_W/2;
        nodes.push({ ...cnd, id:item.block+'_'+childId, origId:childId, x:sx, y, w:SUB_NODE_W, h:SUB_NODE_H });
        subNodes.push({ id:item.block+'_'+childId, y, h:SUB_NODE_H });
        y += SUB_NODE_H + SUB_GAP;
      }
      y += 4;
      const blockH = y - blockStartY;
      blocks.push({ id:item.block, label:blockNd.label + ' (' + blockNd.sublabel + ')', x:blockX, y:blockStartY, w:NODE_W+40, h:blockH });
      blockTop = blockStartY; blockBot = y;

      if (prevMainId) {
        arrows.push({ id:prevMainId+'->'+item.block, x1:cx, y1:prevMainBottom, x2:cx, y2:blockStartY });
      }
      for (let i=1; i<subNodes.length; i++) {
        arrows.push({ id:subNodes[i-1].id+'->'+subNodes[i].id, x1:cx, y1:subNodes[i-1].y+subNodes[i-1].h, x2:cx, y2:subNodes[i].y });
      }
      prevMainId = item.block;
      prevMainBottom = y;
      y += GAP_Y;
    }
  }

  // PLE fan-out: dashed lines from the PLE node to the decoder block
  if (pleY && blockTop) {
    const sx = cx - NODE_W/2 - 30;
    const cpx = cx - NODE_W/2 - 90;
    skips.push({
      id:'ple_curve',
      d:`M ${sx} ${pleY} C ${cpx} ${pleY} ${cpx} ${(blockTop+blockBot)/2} ${sx} ${(blockTop+blockBot)/2}`
    });
  }

  return { nodes, arrows, blocks, skips, height: y + 20, width: cx + NODE_W/2 + 120 };
});

const visibleNodes = computed(() => layout.value.nodes);
const arrows = computed(() => layout.value.arrows);
const blockContainers = computed(() => layout.value.blocks);
const skipPaths = computed(() => layout.value.skips);
const svgWidth = computed(() => layout.value.width);
const svgHeight = computed(() => layout.value.height);

// ─── Matrix view: rows = arch nodes that appear in at least one HACK_MATRIX entry ───
const hackCols = computed(() => HACK_COLS.map(id => nodeMap[id]).filter(Boolean));
const matrixRows = computed(() => {
  // Arch nodes that show up on either axis of HACK_MATRIX
  const archIds = new Set(HACK_MATRIX.map(e => e.arch));
  // Preserve FLOW ordering for readability
  const ordered = [];
  const seen = new Set();
  const pushIfArch = (id) => {
    if (archIds.has(id) && !seen.has(id)) { ordered.push(id); seen.add(id); }
  };
  for (const item of FLOW) {
    if (typeof item === 'string') pushIfArch(item);
    else if (item && item.block) {
      pushIfArch(item.block);
      for (const c of item.children) pushIfArch(c);
    }
  }
  return ordered.map(archId => {
    const cells = {};
    for (const entry of HACK_MATRIX) {
      if (entry.arch === archId) cells[entry.hack] = { label:entry.label, impact:entry.impact };
    }
    return { arch: nodeMap[archId], cells };
  });
});

// ─── Function map view: resolved node objects per zone ───
const functionZones = computed(() => {
  return FUNCTIONS.map(z => ({
    id: z.id,
    label: z.label,
    analogy: z.analogy,
    nodes: z.nodes.map(id => nodeMap[id]).filter(Boolean),
  }));
});

function nodesInCategory(cat) {
  return NODES.filter(n => n.category === cat && (!search.value || n.label.toLowerCase().includes(search.value.toLowerCase())));
}

function selectNode(id) {
  const layoutNode = layout.value.nodes.find(n => n.id === id);
  const origId = (layoutNode && layoutNode.origId) ? layoutNode.origId : id;
  if (nodeMap[origId]) {
    selectedNodeId.value = origId;
    detailTab.value = 'learn';
  }
}

function getChange(nodeId, submissionId) {
  const nd = nodeMap[nodeId];
  if (!nd || !nd.changes) return null;
  return nd.changes[submissionId] || null;
}

function resolveOrigId(nodeId) {
  const ln = layout.value.nodes.find(n => n.id === nodeId);
  return (ln && ln.origId) ? ln.origId : nodeId;
}

function isChanged(nodeId) {
  if (!compareSubmission.value) return false;
  const origId = resolveOrigId(nodeId);
  const nd = nodeMap[origId];
  return nd && nd.changes && nd.changes[compareSubmission.value];
}

function isGhosted(nodeId) {
  const origId = resolveOrigId(nodeId);
  const nd = nodeMap[origId];
  if (!nd || !nd.advanced) return false;
  const sub = viewSubmission.value;
  // PLE exists only on E2B/E4B
  if (origId === 'ple') return !['e2b','e4b'].includes(sub);
  // MoE side block only on 26B-A4B
  if (origId === 'moe_block') return sub !== 'moe';
  // Vision encoder exists on all sizes but may be hidden in text-only builds
  return false;
}

function saveNotes() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('gemma-explorer-notes', JSON.stringify(userNotes.value));
  }
}
function getNotes(nodeId) { return userNotes.value[nodeId] || []; }
function addNote(nodeId) {
  if (!userNotes.value[nodeId]) userNotes.value[nodeId] = [];
  userNotes.value[nodeId].push({ id:generateId(), text:'', isTodo:false, done:false });
  saveNotes();
}
function deleteNote(nodeId, noteId) {
  if (!userNotes.value[nodeId]) return;
  userNotes.value[nodeId] = userNotes.value[nodeId].filter(n => n.id !== noteId);
  if (!userNotes.value[nodeId].length) delete userNotes.value[nodeId];
  saveNotes();
}

function arrowHead(x, y) { return `${x-4},${y-6} ${x},${y} ${x+4},${y-6}`; }
</script>

<template>
  <div class="gemma-root">
    <div class="header">
      <h1><span>Gemma 4</span> Architecture Explorer &middot; <span style="color:var(--hack)">hackable edition</span></h1>
      <a href="hacks.html" style="color:var(--text2); text-decoration:none; font-size:11px; text-transform:uppercase; letter-spacing:1px; padding:4px 8px; border:1px solid var(--border); border-radius:4px;">Hack Recipes →</a>
      <div class="header-controls">
        <div>
          <label>Variant</label><br>
          <select v-model="viewSubmission">
            <option v-for="s in submissions" :key="s.id" :value="s.id">{{s.label}} ({{s.score}})</option>
          </select>
        </div>
        <div>
          <label>Compare with</label><br>
          <select v-model="compareSubmission">
            <option value="">None</option>
            <option v-for="s in submissions" :key="s.id" :value="s.id" v-show="s.id !== viewSubmission">{{s.label}}</option>
          </select>
        </div>
      </div>
      <div class="view-toggle">
        <button :class="{active:view==='flow'}" @click="view='flow'">Flow</button>
        <button :class="{active:view==='matrix'}" @click="view='matrix'">Hack Matrix</button>
        <button :class="{active:view==='function'}" @click="view='function'">Function Map</button>
      </div>
      <div class="legend">
        <div class="legend-item" v-for="(cat, key) in categories" :key="key">
          <div class="legend-dot" :style="{background:cat.color}"></div>
          {{cat.label}}
        </div>
      </div>
    </div>

    <div class="main">
      <div class="sidebar">
        <div class="sidebar-search">
          <input v-model="search" placeholder="Search nodes...">
        </div>
        <template v-for="(cat, key) in categories" :key="key">
          <div class="sidebar-group" v-if="nodesInCategory(key).length">
            <div class="sidebar-group-label">{{cat.label}}</div>
            <div v-for="n in nodesInCategory(key)" :key="n.id"
                 class="sidebar-item" :class="{active: selectedNodeId===n.id, sub: n.isSub}"
                 @click="selectNode(n.id)">
              <div class="sidebar-dot" :style="{background:cat.color}"></div>
              {{n.label}}
              <span class="change-badge" v-if="isChanged(n.id)" title="Differs in compared variant"></span>
              <span class="note-badge" v-else-if="getNotes(n.id).length">{{getNotes(n.id).length}}</span>
            </div>
          </div>
        </template>
      </div>

      <div class="diagram-container" v-if="view==='flow'">
        <svg :width="svgWidth" :height="svgHeight" xmlns="http://www.w3.org/2000/svg">
          <template v-for="arrow in arrows" :key="arrow.id">
            <line :x1="arrow.x1" :y1="arrow.y1" :x2="arrow.x2" :y2="arrow.y2" class="arrow-line"/>
            <polygon :points="arrowHead(arrow.x2,arrow.y2)" class="arrow-head"/>
          </template>

          <path v-for="skip in skipPaths" :key="skip.id" :d="skip.d" class="ple-path"/>

          <rect v-for="blk in blockContainers" :key="blk.id"
                :x="blk.x" :y="blk.y" :width="blk.w" :height="blk.h"
                class="block-container" rx="8"/>
          <text v-for="blk in blockContainers" :key="blk.id+'lbl'"
                :x="blk.x+8" :y="blk.y+14" font-size="9" fill="#9498a8" font-family="inherit">
            {{blk.label}}
          </text>

          <g v-for="n in visibleNodes" :key="n.id" :transform="'translate('+n.x+','+n.y+')'"
             @click="selectNode(n.id)" style="cursor:pointer">
            <rect :width="n.w" :height="n.h" :rx="6"
                  :fill="categories[n.category].color"
                  :class="{
                    'node-rect':true,
                    'ghost-node': isGhosted(n.id),
                    'changed-highlight': isChanged(n.id)
                  }"
                  :stroke="selectedNodeId===n.id ? '#fff' : 'transparent'"
                  stroke-width="2"
                  :opacity="isGhosted(n.id) ? 0.25 : 1"/>
            <text :x="n.w/2" :y="n.h/2 - (n.sublabel?4:0)" text-anchor="middle" dominant-baseline="middle" class="node-label">
              {{n.label}}
            </text>
            <text v-if="n.sublabel" :x="n.w/2" :y="n.h/2+10" text-anchor="middle" dominant-baseline="middle" class="node-sublabel">
              {{n.sublabel}}
            </text>
          </g>
        </svg>
      </div>

      <!-- HACK MATRIX VIEW -->
      <div class="matrix-container" v-else-if="view==='matrix'">
        <div class="matrix-intro">
          <strong>How each hack touches each architectural part.</strong> Rows are the pieces of Gemma 4; columns are the five tinker-friendly techniques. Green cells = big impact, faded cells = small tweak. Click a cell to open the relevant part in the detail panel.
        </div>
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="corner"></th>
              <th class="col-head" v-for="h in hackCols" :key="h.id" @click="selectNode(h.id)">{{h.label}}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in matrixRows" :key="row.arch.id">
              <th class="row-head" @click="selectNode(row.arch.id)">
                {{row.arch.label}}
                <span class="row-sub" v-if="row.arch.sublabel">{{row.arch.sublabel}}</span>
              </th>
              <td v-for="h in hackCols" :key="h.id"
                  class="matrix-cell"
                  :class="row.cells[h.id] ? row.cells[h.id].impact : 'empty'"
                  @click="row.cells[h.id] && selectNode(row.arch.id)">
                {{ row.cells[h.id] ? row.cells[h.id].label : '' }}
              </td>
            </tr>
          </tbody>
        </table>
        <div class="matrix-legend">
          <span><span class="dot" style="background:var(--impact-high)"></span>High impact</span>
          <span><span class="dot" style="background:var(--impact-med)"></span>Medium</span>
          <span><span class="dot" style="background:var(--impact-low)"></span>Low / keep as-is</span>
        </div>
      </div>

      <!-- FUNCTION MAP VIEW -->
      <div class="funcmap-container" v-else-if="view==='function'">
        <div class="funcmap-intro">
          <strong>What each part is <em>for</em>, in plain English.</strong> Forget layer types and ML jargon for a moment — this view groups Gemma 4's pieces by the job they do in the overall system. Click any node to see the full detail.
        </div>
        <div class="func-zone" v-for="zone in functionZones" :key="zone.id">
          <div class="func-zone-title">{{zone.label}}</div>
          <div class="func-zone-analogy">{{zone.analogy}}</div>
          <div class="func-zone-nodes">
            <div v-for="nd in zone.nodes" :key="nd.id"
                 class="func-node"
                 :style="{background:categories[nd.category].color}"
                 @click="selectNode(nd.id)">
              {{nd.label}}
              <span class="func-node-sub" v-if="nd.sublabel">{{nd.sublabel}}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="detail">
        <div v-if="!selectedNode" class="detail-empty">
          Click a node in the diagram<br>or sidebar to explore it
        </div>
        <template v-else>
          <div class="detail-header">
            <h2>{{selectedNode.label}}</h2>
            <span class="category-tag" :style="{background:categories[selectedNode.category].color+'33', color:categories[selectedNode.category].color}">
              {{categories[selectedNode.category].label}}
            </span>
          </div>
          <div class="detail-tabs">
            <div class="detail-tab" :class="{active:detailTab==='learn'}" @click="detailTab='learn'">Learn</div>
            <div class="detail-tab" :class="{active:detailTab==='compare'}" @click="detailTab='compare'">Variants</div>
            <div class="detail-tab" :class="{active:detailTab==='notes'}" @click="detailTab='notes'">
              Notes <span v-if="getNotes(selectedNodeId).length">({{getNotes(selectedNodeId).length}})</span>
            </div>
          </div>
          <div class="detail-body">
            <template v-if="detailTab==='learn'">
              <div class="analogy-box" v-if="selectedNode.details.analogy">
                <div class="analogy-label">In plain English</div>
                <p>{{selectedNode.details.analogy}}</p>
              </div>
              <div class="learn-section">
                <h3>What it does</h3>
                <p>{{selectedNode.details.whatItDoes}}</p>
              </div>
              <div class="learn-section">
                <h3>Why it matters</h3>
                <p>{{selectedNode.details.whyItMatters}}</p>
              </div>
              <div class="learn-section" v-if="selectedNode.details.keyParams">
                <h3>Key parameters (E4B)</h3>
                <table class="param-table">
                  <tr v-for="(v,k) in selectedNode.details.keyParams" :key="k">
                    <td>{{k}}</td><td>{{v}}</td>
                  </tr>
                </table>
              </div>
              <div class="learn-section hack" v-if="selectedNode.details.hackIt">
                <h3>⚡ Hack it on your laptop</h3>
                <ul><li v-for="h in selectedNode.details.hackIt" :key="h">{{h}}</li></ul>
              </div>
              <div class="learn-section" v-if="selectedNode.details.alternatives">
                <h3>Alternatives to explore</h3>
                <ul><li v-for="a in selectedNode.details.alternatives" :key="a">{{a}}</li></ul>
              </div>
              <div class="learn-section" v-if="selectedNode.details.studyFurther">
                <h3>Study further</h3>
                <a class="study-link" v-for="s in selectedNode.details.studyFurther" :key="s.topic"
                   :href="s.url" target="_blank" rel="noopener">{{s.topic}}</a>
              </div>
            </template>

            <template v-if="detailTab==='compare'">
              <div v-for="s in submissions" :key="s.id" class="compare-item"
                   :class="{changed: getChange(selectedNodeId, s.id)}">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <strong>{{s.label}}</strong>
                  <span class="sub-score">{{s.score}}</span>
                </div>
                <div class="sub-label">{{s.ctx}} ctx &middot; {{s.layers}}L &middot; {{s.ramQ4}} q4 RAM</div>
                <div class="change-text" v-if="getChange(selectedNodeId, s.id)">
                  {{getChange(selectedNodeId, s.id)}}
                </div>
                <div class="change-text" v-else style="color:var(--text2)">Same as E2B baseline</div>
              </div>
            </template>

            <template v-if="detailTab==='notes'">
              <div v-for="note in getNotes(selectedNodeId)" :key="note.id"
                   class="note-item" :class="{done:note.done}">
                <textarea v-model="note.text" @input="saveNotes" placeholder="Write a note..."></textarea>
                <div class="note-controls">
                  <label><input type="checkbox" v-model="note.isTodo" @change="saveNotes"> TODO</label>
                  <label v-if="note.isTodo"><input type="checkbox" v-model="note.done" @change="saveNotes"> Done</label>
                  <button @click="deleteNote(selectedNodeId, note.id)" style="margin-left:auto">Delete</button>
                </div>
              </div>
              <button class="add-note-btn" @click="addNote(selectedNodeId)">+ Add Note</button>
            </template>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style>
.gemma-root { display: grid; grid-template-rows: auto 1fr; height: calc(100vh - 42px); }

.gemma-root .header { background:var(--bg2); border-bottom:1px solid var(--border); padding:12px 20px; display:flex; align-items:center; gap:20px; flex-wrap:wrap; }
.gemma-root .header h1 { font-size:16px; font-weight:600; letter-spacing:0.5px; white-space:nowrap; }
.gemma-root .header h1 span { color:var(--accent); }
.gemma-root .header-controls { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
.gemma-root .header-controls label { font-size:11px; color:var(--text2); text-transform:uppercase; letter-spacing:1px; }
.gemma-root .header-controls select { background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:4px 8px; border-radius:4px; font-family:inherit; font-size:12px; cursor:pointer; }
.gemma-root .legend { display:flex; gap:10px; margin-left:auto; flex-wrap:wrap; }
.gemma-root .legend-item { display:flex; align-items:center; gap:4px; font-size:10px; color:var(--text2); }
.gemma-root .legend-dot { width:8px; height:8px; border-radius:50%; }

.gemma-root .main { display:grid; grid-template-columns: 210px 1fr 380px; overflow:hidden; }

.gemma-root .sidebar { background:var(--bg2); border-right:1px solid var(--border); overflow-y:auto; padding:8px 0; }
.gemma-root .sidebar-search { padding:6px 12px; }
.gemma-root .sidebar-search input { width:100%; background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:6px 8px; border-radius:4px; font-family:inherit; font-size:11px; }
.gemma-root .sidebar-group { margin-top:8px; }
.gemma-root .sidebar-group-label { font-size:9px; text-transform:uppercase; letter-spacing:1.5px; color:var(--text2); padding:4px 12px; }
.gemma-root .sidebar-item { padding:6px 12px; cursor:pointer; display:flex; align-items:center; gap:8px; font-size:12px; transition:background 0.15s; }
.gemma-root .sidebar-item:hover { background:var(--bg3); }
.gemma-root .sidebar-item.active { background:var(--bg3); border-left:2px solid var(--accent); }
.gemma-root .sidebar-item.sub { padding-left:28px; font-size:11px; color:var(--text2); }
.gemma-root .sidebar-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
.gemma-root .sidebar-item .change-badge { width:6px; height:6px; border-radius:50%; background:var(--gold); margin-left:auto; flex-shrink:0; }
.gemma-root .sidebar-item .note-badge { font-size:9px; color:var(--accent); margin-left:auto; }

.gemma-root .diagram-container { overflow:auto; padding:20px; display:flex; justify-content:center; }
.gemma-root .diagram-container svg { flex-shrink:0; }
.gemma-root .node-rect { cursor:pointer; transition:opacity 0.2s; }
.gemma-root .node-rect:hover { opacity:0.9; }
.gemma-root .node-label { font-family:inherit; font-size:11px; fill:white; pointer-events:none; font-weight:500; }
.gemma-root .node-sublabel { font-family:inherit; font-size:9px; fill:rgba(255,255,255,0.7); pointer-events:none; }
.gemma-root .arrow-line { stroke:var(--border); stroke-width:1.5; }
.gemma-root .arrow-head { fill:var(--border); }
.gemma-root .ple-path { fill:none; stroke:var(--cat-embedding); stroke-width:1.5; stroke-dasharray:3,3; opacity:0.55; }
.gemma-root .block-container { fill:none; stroke:var(--border); stroke-width:1; stroke-dasharray:6,3; rx:8; }
.gemma-root .ghost-node { opacity:0.3; stroke-dasharray:4,2; }
@keyframes goldPulse { 0%,100%{stroke-opacity:0.4} 50%{stroke-opacity:1} }
.gemma-root .changed-highlight { stroke:var(--gold); stroke-width:2.5; stroke-dasharray:none; animation:goldPulse 1.5s infinite; }

.gemma-root .detail { background:var(--bg2); border-left:1px solid var(--border); overflow-y:auto; display:flex; flex-direction:column; }
.gemma-root .detail-empty { display:flex; align-items:center; justify-content:center; height:100%; color:var(--text2); font-size:13px; text-align:center; padding:20px; }
.gemma-root .detail-header { padding:16px; border-bottom:1px solid var(--border); }
.gemma-root .detail-header h2 { font-size:15px; font-weight:600; margin-bottom:4px; }
.gemma-root .detail-header .category-tag { font-size:10px; text-transform:uppercase; letter-spacing:1px; padding:2px 6px; border-radius:3px; display:inline-block; }
.gemma-root .detail-tabs { display:flex; border-bottom:1px solid var(--border); }
.gemma-root .detail-tab { flex:1; padding:8px; text-align:center; font-size:11px; cursor:pointer; text-transform:uppercase; letter-spacing:1px; color:var(--text2); border-bottom:2px solid transparent; transition:all 0.15s; }
.gemma-root .detail-tab:hover { color:var(--text); }
.gemma-root .detail-tab.active { color:var(--accent); border-bottom-color:var(--accent); }
.gemma-root .detail-body { padding:16px; flex:1; overflow-y:auto; }

.gemma-root .learn-section { margin-bottom:16px; }
.gemma-root .learn-section h3 { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--accent); margin-bottom:6px; }
.gemma-root .learn-section.hack h3 { color:var(--hack); }
.gemma-root .learn-section p { font-size:12px; line-height:1.6; color:var(--text); }
.gemma-root .learn-section ul { list-style:none; padding:0; }
.gemma-root .learn-section li { font-size:12px; padding:3px 0; color:var(--text); line-height:1.5; }
.gemma-root .learn-section li::before { content:'\2022'; color:var(--accent); margin-right:8px; }
.gemma-root .learn-section.hack li::before { color:var(--hack); }
.gemma-root .param-table { width:100%; font-size:11px; border-collapse:collapse; }
.gemma-root .param-table td { padding:3px 8px; border-bottom:1px solid var(--border); }
.gemma-root .param-table td:first-child { color:var(--accent); white-space:nowrap; }
.gemma-root .study-link { display:block; font-size:11px; color:var(--accent); text-decoration:none; padding:3px 0; }
.gemma-root .study-link:hover { text-decoration:underline; }

.gemma-root .compare-item { padding:8px; margin-bottom:6px; border-radius:4px; border:1px solid var(--border); font-size:12px; }
.gemma-root .compare-item.changed { border-color:var(--gold); background:rgba(255,215,0,0.05); }
.gemma-root .compare-item .sub-label { font-size:10px; color:var(--text2); }
.gemma-root .compare-item .sub-score { font-size:10px; color:var(--gold); }
.gemma-root .compare-item .change-text { margin-top:4px; color:var(--text); line-height:1.5; }

.gemma-root .note-item { background:var(--bg3); border-radius:4px; padding:8px; margin-bottom:6px; position:relative; }
.gemma-root .note-item.done { opacity:0.5; }
.gemma-root .note-item textarea { width:100%; background:transparent; border:none; color:var(--text); font-family:inherit; font-size:11px; resize:vertical; min-height:40px; line-height:1.5; }
.gemma-root .note-item textarea:focus { outline:none; }
.gemma-root .note-controls { display:flex; gap:6px; align-items:center; margin-top:4px; }
.gemma-root .note-controls label { font-size:10px; color:var(--text2); display:flex; align-items:center; gap:4px; cursor:pointer; }
.gemma-root .note-controls button { background:none; border:none; color:var(--text2); cursor:pointer; font-size:10px; padding:2px 4px; }
.gemma-root .note-controls button:hover { color:var(--cat-output); }
.gemma-root .add-note-btn { width:100%; padding:8px; background:var(--bg3); border:1px dashed var(--border); border-radius:4px; color:var(--text2); font-family:inherit; font-size:11px; cursor:pointer; margin-top:8px; }
.gemma-root .add-note-btn:hover { border-color:var(--accent); color:var(--accent); }

/* View toggle */
.gemma-root .view-toggle { display:flex; gap:0; border:1px solid var(--border); border-radius:4px; overflow:hidden; }
.gemma-root .view-toggle button { background:var(--bg3); border:none; color:var(--text2); padding:6px 10px; font-family:inherit; font-size:11px; cursor:pointer; text-transform:uppercase; letter-spacing:1px; border-right:1px solid var(--border); }
.gemma-root .view-toggle button:last-child { border-right:none; }
.gemma-root .view-toggle button.active { background:var(--accent); color:#fff; }
.gemma-root .view-toggle button:hover:not(.active) { background:var(--bg2); color:var(--text); }

/* Plain-English analogy block */
.gemma-root .analogy-box { background:rgba(108,140,255,0.08); border-left:3px solid var(--accent); padding:10px 12px; margin-bottom:16px; border-radius:4px; }
.gemma-root .analogy-box .analogy-label { font-size:9px; text-transform:uppercase; letter-spacing:1.5px; color:var(--accent); margin-bottom:4px; }
.gemma-root .analogy-box p { font-size:12px; line-height:1.6; color:var(--text); font-style:italic; }

/* Matrix view */
.gemma-root .matrix-container { padding:20px; overflow:auto; width:100%; }
.gemma-root .matrix-intro { font-size:12px; color:var(--text2); margin-bottom:16px; max-width:720px; line-height:1.6; }
.gemma-root .matrix-intro strong { color:var(--text); }
.gemma-root .matrix-table { border-collapse:separate; border-spacing:4px; font-size:11px; }
.gemma-root .matrix-table th, .gemma-root .matrix-table td { padding:8px 10px; text-align:center; border-radius:4px; white-space:nowrap; vertical-align:middle; }
.gemma-root .matrix-table th.corner { background:transparent; }
.gemma-root .matrix-table th.col-head { background:var(--cat-hacking); color:#0a0e14; font-weight:600; min-width:110px; cursor:pointer; }
.gemma-root .matrix-table th.col-head:hover { opacity:0.85; }
.gemma-root .matrix-table th.row-head { background:var(--bg3); color:var(--text); text-align:left; min-width:180px; cursor:pointer; border-left:3px solid transparent; }
.gemma-root .matrix-table th.row-head:hover { border-left-color:var(--accent); }
.gemma-root .matrix-table th.row-head .row-sub { display:block; font-size:9px; color:var(--text2); text-transform:none; letter-spacing:0; margin-top:2px; font-weight:normal; }
.gemma-root .matrix-cell { cursor:pointer; color:#0a0e14; font-weight:500; transition:transform 0.1s; }
.gemma-root .matrix-cell:hover { transform:scale(1.05); }
.gemma-root .matrix-cell.high { background:var(--impact-high); color:#0a0e14; }
.gemma-root .matrix-cell.medium { background:var(--impact-med); color:#e0e0e8; }
.gemma-root .matrix-cell.low { background:var(--impact-low); color:var(--text2); font-style:italic; }
.gemma-root .matrix-cell.empty { background:transparent; }
.gemma-root .matrix-legend { display:flex; gap:14px; margin-top:14px; font-size:10px; color:var(--text2); }
.gemma-root .matrix-legend .dot { display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:4px; vertical-align:middle; }

/* Function map view */
.gemma-root .funcmap-container { padding:20px; overflow:auto; width:100%; }
.gemma-root .funcmap-intro { font-size:12px; color:var(--text2); margin-bottom:16px; max-width:720px; line-height:1.6; }
.gemma-root .func-zone { background:var(--func-zone); border:1.5px dashed var(--border); border-radius:10px; padding:14px 16px; margin-bottom:14px; }
.gemma-root .func-zone-title { font-size:14px; font-weight:600; color:var(--text); margin-bottom:2px; }
.gemma-root .func-zone-analogy { font-size:11px; font-style:italic; color:var(--text2); margin-bottom:10px; line-height:1.5; }
.gemma-root .func-zone-nodes { display:flex; flex-wrap:wrap; gap:8px; }
.gemma-root .func-node { padding:8px 12px; border-radius:6px; font-size:11px; color:#fff; font-weight:500; cursor:pointer; transition:transform 0.1s; min-width:140px; }
.gemma-root .func-node:hover { transform:scale(1.03); }
.gemma-root .func-node .func-node-sub { display:block; font-size:9px; opacity:0.75; margin-top:2px; }

@media (max-width:900px) {
  .gemma-root .main { grid-template-columns:1fr; grid-template-rows:auto 1fr auto; }
  .gemma-root .sidebar { max-height:150px; border-right:none; border-bottom:1px solid var(--border); }
  .gemma-root .detail { max-height:40vh; border-left:none; border-top:1px solid var(--border); }
}
</style>
