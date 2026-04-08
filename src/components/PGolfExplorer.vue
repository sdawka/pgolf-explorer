<script setup lang="ts">
// @ts-nocheck
import { ref, computed, onMounted } from 'vue';
import {
  CATEGORIES,
  SUBMISSIONS,
  NODES,
  NODE_W,
  NODE_H,
  GAP_Y,
  SUB_NODE_W,
  SUB_NODE_H,
  SUB_GAP,
  OFFSET_X,
  FLOW,
} from '../data/pgolf-architecture';

function generateId() {
  return Math.random().toString(36).substr(2,9);
}

function loadNotes() {
  try {
    return JSON.parse(localStorage.getItem('pgolf-explorer-notes') || '{}');
  } catch { return {}; }
}

const selectedNodeId = ref(null);
const viewSubmission = ref('baseline');
const compareSubmission = ref('');
const detailTab = ref('learn');
const search = ref('');
const userNotes = ref(typeof localStorage !== 'undefined' ? loadNotes() : {});

const categories = CATEGORIES;
const submissions = SUBMISSIONS;

// ─── Node lookup ───
const nodeMap = {};
NODES.forEach(n => nodeMap[n.id] = n);

const selectedNode = computed(() => nodeMap[selectedNodeId.value] || null);

// ─── Layout computation ───
const layout = computed(() => {
  const nodes = [];
  const arrows = [];
  const blocks = [];
  const skips = [];
  let y = 20;
  const cx = 220; // center x for main nodes
  let prevMainId = null;
  let prevMainBottom = 0;
  let encoderBlockY = 0;
  let encoderBlockBottom = 0;
  let decoderBlockY = 0;
  let decoderBlockBottom = 0;

  for (const item of FLOW) {
    if (item === '__sep__') {
      y += 30;
      prevMainId = null;
      continue;
    }
    if (typeof item === 'string') {
      const nd = nodeMap[item];
      if (!nd) continue;
      const x = cx - NODE_W/2;
      nodes.push({ ...nd, x, y, w:NODE_W, h:NODE_H });
      if (prevMainId) {
        arrows.push({ id:prevMainId+'->'+item, x1:cx, y1:prevMainBottom, x2:cx, y2:y });
      }
      prevMainId = item;
      prevMainBottom = y + NODE_H;
      y += NODE_H + GAP_Y;
    } else if (item.block) {
      // Block container with sub-nodes
      const blockNd = nodeMap[item.block];
      if (!blockNd) continue;
      const blockStartY = y;
      const blockX = cx - NODE_W/2 - 20;
      // Block header
      y += 22;
      // Sub-nodes
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

      // Track for skip paths
      if (item.block === 'encoder_block') { encoderBlockY = blockStartY; encoderBlockBottom = y; }
      if (item.block === 'decoder_block') { decoderBlockY = blockStartY; decoderBlockBottom = y; }

      // Arrow from prev to block, block to next
      if (prevMainId) {
        arrows.push({ id:prevMainId+'->'+item.block, x1:cx, y1:prevMainBottom, x2:cx, y2:blockStartY });
      }
      // Arrows between sub-nodes
      for (let i=1; i<subNodes.length; i++) {
        arrows.push({ id:subNodes[i-1].id+'->'+subNodes[i].id, x1:cx, y1:subNodes[i-1].y+subNodes[i-1].h, x2:cx, y2:subNodes[i].y });
      }
      prevMainId = item.block;
      prevMainBottom = y;
      y += GAP_Y;
    }
  }

  // Skip connection curves (encoder right side to decoder right side)
  if (encoderBlockBottom && decoderBlockY) {
    const sx = cx + NODE_W/2 + 30;
    const cpx = cx + NODE_W/2 + 80;
    skips.push({
      id:'skip_curve',
      d:`M ${sx} ${encoderBlockBottom - 20} C ${cpx} ${encoderBlockBottom} ${cpx} ${decoderBlockY} ${sx} ${decoderBlockY + 20}`
    });
  }

  return { nodes, arrows, blocks, skips, height: y + 20, width: cx + NODE_W/2 + 120 };
});

const visibleNodes = computed(() => {
  return layout.value.nodes;
});
const arrows = computed(() => layout.value.arrows);
const blockContainers = computed(() => layout.value.blocks);
const skipPaths = computed(() => layout.value.skips);
const svgWidth = computed(() => layout.value.width);
const svgHeight = computed(() => layout.value.height);

// ─── Sidebar ───
function nodesInCategory(cat) {
  return NODES.filter(n => n.category === cat && (!search.value || n.label.toLowerCase().includes(search.value.toLowerCase())));
}

// ─── Selection ───
function selectNode(id) {
  // Handle block sub-node IDs like 'encoder_block_self_attn'
  // Layout nodes from blocks have origId set
  const layoutNode = layout.value.nodes.find(n => n.id === id);
  const origId = (layoutNode && layoutNode.origId) ? layoutNode.origId : id;
  if (nodeMap[origId]) {
    selectedNodeId.value = origId;
    detailTab.value = 'learn';
  }
}

// ─── Changes ───
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
  // Show advanced nodes only if the viewed submission uses them
  if (sub === 'baseline') return true;
  if (origId === 'bigram_hash') return !['sota','rank2','smear'].includes(sub);
  if (origId === 'smear_gate') return !['sota','rank2','smear'].includes(sub);
  if (origId === 'swa') return !['sota','rank2'].includes(sub);
  if (origId === 'sliding_eval') return !['sota','rank2','rank3','smear'].includes(sub);
  if (origId === 'lora_ttt') return sub !== 'lora';
  return false;
}

// ─── Notes ───
function saveNotes() {
  localStorage.setItem('pgolf-explorer-notes', JSON.stringify(userNotes.value));
}
function getNotes(nodeId) {
  return userNotes.value[nodeId] || [];
}
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

// ─── SVG helpers ───
function arrowHead(x, y) {
  return `${x-4},${y-6} ${x},${y} ${x+4},${y-6}`;
}

onMounted(() => {
  userNotes.value = loadNotes();
});
</script>

<template>
  <div class="pgolf-root">
    <!-- HEADER -->
    <div class="header">
      <h1><span>Parameter Golf</span> Architecture Explorer</h1>
      <div class="header-controls">
        <div>
          <label>Viewing</label><br>
          <select v-model="viewSubmission">
            <option v-for="s in submissions" :key="s.id" :value="s.id">{{s.label}} ({{s.score}})</option>
          </select>
        </div>
        <div>
          <label>Compare with</label><br>
          <select v-model="compareSubmission">
            <option value="">None</option>
            <option v-for="s in submissions" :key="s.id" :value="s.id" v-show="s.id !== viewSubmission">{{s.label}} ({{s.score}})</option>
          </select>
        </div>
      </div>
      <div class="legend">
        <div class="legend-item" v-for="(cat, key) in categories" :key="key">
          <div class="legend-dot" :style="{background:cat.color}"></div>
          {{cat.label}}
        </div>
      </div>
    </div>

    <!-- MAIN -->
    <div class="main">
      <!-- SIDEBAR -->
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
              <span class="change-badge" v-if="isChanged(n.id)" title="Changed in comparison"></span>
              <span class="note-badge" v-else-if="getNotes(n.id).length">{{getNotes(n.id).length}}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- DIAGRAM -->
      <div class="diagram-container">
        <svg :width="svgWidth" :height="svgHeight" xmlns="http://www.w3.org/2000/svg">
          <!-- Arrows -->
          <template v-for="arrow in arrows" :key="arrow.id">
            <line :x1="arrow.x1" :y1="arrow.y1" :x2="arrow.x2" :y2="arrow.y2" class="arrow-line"/>
            <polygon :points="arrowHead(arrow.x2,arrow.y2)" class="arrow-head"/>
          </template>

          <!-- U-Net skip curves -->
          <path v-for="skip in skipPaths" :key="skip.id" :d="skip.d" class="skip-path"/>

          <!-- Block containers -->
          <rect v-for="blk in blockContainers" :key="blk.id"
                :x="blk.x" :y="blk.y" :width="blk.w" :height="blk.h"
                class="block-container" rx="8"/>
          <text v-for="blk in blockContainers" :key="blk.id+'lbl'"
                :x="blk.x+8" :y="blk.y+14" font-size="9" fill="#9498a8" font-family="inherit">
            {{blk.label}}
          </text>

          <!-- Nodes -->
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

      <!-- DETAIL PANEL -->
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
            <div class="detail-tab" :class="{active:detailTab==='compare'}" @click="detailTab='compare'">Compare</div>
            <div class="detail-tab" :class="{active:detailTab==='notes'}" @click="detailTab='notes'">
              Notes <span v-if="getNotes(selectedNodeId).length">({{getNotes(selectedNodeId).length}})</span>
            </div>
          </div>
          <div class="detail-body">

            <!-- LEARN TAB -->
            <template v-if="detailTab==='learn'">
              <div class="analogy-box" v-if="selectedNode.details.plainEnglish">
                <div class="analogy-label">In plain English</div>
                <p>{{ selectedNode.details.plainEnglish }}</p>
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
                <h3>Key parameters (baseline)</h3>
                <table class="param-table">
                  <tr v-for="(v,k) in selectedNode.details.keyParams" :key="k">
                    <td>{{k}}</td><td>{{v}}</td>
                  </tr>
                </table>
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

            <!-- COMPARE TAB -->
            <template v-if="detailTab==='compare'">
              <div v-for="s in submissions" :key="s.id" class="compare-item"
                   :class="{changed: getChange(selectedNodeId, s.id)}">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <strong>{{s.label}}</strong>
                  <span class="sub-score">{{s.score}} BPB</span>
                </div>
                <div class="sub-label">{{s.date}} &middot; {{s.layers}}L &middot; {{s.mlpMult}}x MLP</div>
                <div class="change-text" v-if="getChange(selectedNodeId, s.id)">
                  {{getChange(selectedNodeId, s.id)}}
                </div>
                <div class="change-text" v-else style="color:var(--text2)">No change from baseline</div>
              </div>
            </template>

            <!-- NOTES TAB -->
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
  .pgolf-root { display:grid; grid-template-rows: auto 1fr; height: calc(100vh - 42px); }

  /* Header */
  .pgolf-root .header { background:var(--bg2); border-bottom:1px solid var(--border); padding:12px 20px; display:flex; align-items:center; gap:20px; flex-wrap:wrap; }
  .pgolf-root .header h1 { font-size:16px; font-weight:600; letter-spacing:0.5px; white-space:nowrap; }
  .pgolf-root .header h1 span { color:var(--accent); }
  .header-controls { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
  .header-controls label { font-size:11px; color:var(--text2); text-transform:uppercase; letter-spacing:1px; }
  .header-controls select { background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:4px 8px; border-radius:4px; font-family:inherit; font-size:12px; cursor:pointer; }
  .legend { display:flex; gap:10px; margin-left:auto; flex-wrap:wrap; }
  .legend-item { display:flex; align-items:center; gap:4px; font-size:10px; color:var(--text2); }
  .legend-dot { width:8px; height:8px; border-radius:50%; }

  /* Main layout */
  .main { display:grid; grid-template-columns: 200px 1fr 360px; overflow:hidden; }

  /* Sidebar */
  .sidebar { background:var(--bg2); border-right:1px solid var(--border); overflow-y:auto; padding:8px 0; }
  .sidebar-search { padding:6px 12px; }
  .sidebar-search input { width:100%; background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:6px 8px; border-radius:4px; font-family:inherit; font-size:11px; }
  .sidebar-group { margin-top:8px; }
  .sidebar-group-label { font-size:9px; text-transform:uppercase; letter-spacing:1.5px; color:var(--text2); padding:4px 12px; }
  .sidebar-item { padding:6px 12px; cursor:pointer; display:flex; align-items:center; gap:8px; font-size:12px; transition:background 0.15s; }
  .sidebar-item:hover { background:var(--bg3); }
  .sidebar-item.active { background:var(--bg3); border-left:2px solid var(--accent); }
  .sidebar-item.sub { padding-left:28px; font-size:11px; color:var(--text2); }
  .sidebar-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
  .sidebar-item .change-badge { width:6px; height:6px; border-radius:50%; background:var(--gold); margin-left:auto; flex-shrink:0; }
  .sidebar-item .note-badge { font-size:9px; color:var(--accent); margin-left:auto; }

  /* Diagram */
  .diagram-container { overflow:auto; padding:20px; display:flex; justify-content:center; }
  .diagram-container svg { flex-shrink:0; }
  .node-rect { cursor:pointer; transition:opacity 0.2s; }
  .node-rect:hover { opacity:0.9; }
  .node-label { font-family:inherit; font-size:11px; fill:white; pointer-events:none; font-weight:500; }
  .node-sublabel { font-family:inherit; font-size:9px; fill:rgba(255,255,255,0.7); pointer-events:none; }
  .arrow-line { stroke:var(--border); stroke-width:1.5; }
  .arrow-head { fill:var(--border); }
  .skip-path { fill:none; stroke:var(--cat-structural); stroke-width:1.5; stroke-dasharray:4,3; opacity:0.6; }
  .block-container { fill:none; stroke:var(--border); stroke-width:1; stroke-dasharray:6,3; rx:8; }
  .ghost-node { opacity:0.3; stroke-dasharray:4,2; }
  @keyframes goldPulse { 0%,100%{stroke-opacity:0.4} 50%{stroke-opacity:1} }
  .changed-highlight { stroke:var(--gold); stroke-width:2.5; stroke-dasharray:none; animation:goldPulse 1.5s infinite; }

  /* Detail Panel */
  .detail { background:var(--bg2); border-left:1px solid var(--border); overflow-y:auto; display:flex; flex-direction:column; }
  .detail-empty { display:flex; align-items:center; justify-content:center; height:100%; color:var(--text2); font-size:13px; text-align:center; padding:20px; }
  .detail-header { padding:16px; border-bottom:1px solid var(--border); }
  .detail-header h2 { font-size:15px; font-weight:600; margin-bottom:4px; }
  .detail-header .category-tag { font-size:10px; text-transform:uppercase; letter-spacing:1px; padding:2px 6px; border-radius:3px; display:inline-block; }
  .detail-tabs { display:flex; border-bottom:1px solid var(--border); }
  .detail-tab { flex:1; padding:8px; text-align:center; font-size:11px; cursor:pointer; text-transform:uppercase; letter-spacing:1px; color:var(--text2); border-bottom:2px solid transparent; transition:all 0.15s; }
  .detail-tab:hover { color:var(--text); }
  .detail-tab.active { color:var(--accent); border-bottom-color:var(--accent); }
  .detail-body { padding:16px; flex:1; overflow-y:auto; }

  /* Learn tab */
  .learn-section { margin-bottom:16px; }
  .learn-section h3 { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--accent); margin-bottom:6px; }
  .learn-section p { font-size:12px; line-height:1.6; color:var(--text); }
  .learn-section ul { list-style:none; padding:0; }
  .learn-section li { font-size:12px; padding:3px 0; color:var(--text); }
  .learn-section li::before { content:'\2022'; color:var(--accent); margin-right:8px; }
  .param-table { width:100%; font-size:11px; border-collapse:collapse; }
  .param-table td { padding:3px 8px; border-bottom:1px solid var(--border); }
  .param-table td:first-child { color:var(--accent); white-space:nowrap; }
  .study-link { display:block; font-size:11px; color:var(--accent); text-decoration:none; padding:3px 0; }
  .study-link:hover { text-decoration:underline; }

  /* Compare tab */
  .compare-item { padding:8px; margin-bottom:6px; border-radius:4px; border:1px solid var(--border); font-size:12px; }
  .compare-item.changed { border-color:var(--gold); background:rgba(255,215,0,0.05); }
  .compare-item .sub-label { font-size:10px; color:var(--text2); }
  .compare-item .sub-score { font-size:10px; color:var(--gold); }
  .compare-item .change-text { margin-top:4px; color:var(--text); line-height:1.5; }

  /* Notes tab */
  .note-item { background:var(--bg3); border-radius:4px; padding:8px; margin-bottom:6px; position:relative; }
  .note-item.done { opacity:0.5; }
  .note-item textarea { width:100%; background:transparent; border:none; color:var(--text); font-family:inherit; font-size:11px; resize:vertical; min-height:40px; line-height:1.5; }
  .note-item textarea:focus { outline:none; }
  .note-controls { display:flex; gap:6px; align-items:center; margin-top:4px; }
  .note-controls label { font-size:10px; color:var(--text2); display:flex; align-items:center; gap:4px; cursor:pointer; }
  .note-controls button { background:none; border:none; color:var(--text2); cursor:pointer; font-size:10px; padding:2px 4px; }
  .note-controls button:hover { color:var(--cat-output); }
  .add-note-btn { width:100%; padding:8px; background:var(--bg3); border:1px dashed var(--border); border-radius:4px; color:var(--text2); font-family:inherit; font-size:11px; cursor:pointer; margin-top:8px; }
  .add-note-btn:hover { border-color:var(--accent); color:var(--accent); }

  /* Responsive */
  @media (max-width:900px) {
    .main { grid-template-columns:1fr; grid-template-rows:auto 1fr auto; }
    .sidebar { max-height:150px; border-right:none; border-bottom:1px solid var(--border); }
    .detail { max-height:40vh; border-left:none; border-top:1px solid var(--border); }
  }
  .analogy-box { background: rgba(108,140,255,0.08); border-left: 3px solid var(--accent); padding: 10px 12px; margin-bottom: 16px; border-radius: 4px; }
  .analogy-box .analogy-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--accent); margin-bottom: 4px; }
  .analogy-box p { font-size: 12px; line-height: 1.6; color: var(--text); font-style: italic; }
</style>
