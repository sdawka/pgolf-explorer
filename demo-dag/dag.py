"""
dag.py — Hierarchical belief DAG, reference implementation.

Matches Recipe 14b in hacks.html. The embedding backend and LLM backend
are pluggable so the demo can run without Ollama or with a hash-based
fallback embedder if sentence-transformers isn't available.
"""
import hashlib, sqlite3, time, json
import numpy as np
from typing import Callable, Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS nodes (
  id         BLOB PRIMARY KEY,
  level      INTEGER NOT NULL,
  kind       INTEGER NOT NULL,
  text       TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  created_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL,
  embedding  BLOB NOT NULL,
  tombstone  INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS edges (
  src        BLOB NOT NULL,
  dst        BLOB NOT NULL,
  predicate  INTEGER NOT NULL,
  weight     REAL NOT NULL DEFAULT 1.0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (src, dst, predicate),
  FOREIGN KEY (src) REFERENCES nodes(id),
  FOREIGN KEY (dst) REFERENCES nodes(id)
);
CREATE INDEX IF NOT EXISTS nodes_level_idx ON nodes(level) WHERE tombstone=0;
CREATE INDEX IF NOT EXISTS edges_src_idx ON edges(src);
CREATE INDEX IF NOT EXISTS edges_dst_idx ON edges(dst);
"""

KIND = {"episode":0, "obs":1, "trait":2, "theme":3, "identity":4}
PRED = {"derived_from":0, "supports":1, "contradicts":2,
        "specializes":3, "supersedes":4}
KINDS_FOR_LEVEL = ["episode","obs","trait","theme","identity"]


def init_dag(path="memory.db"):
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    return conn


# ─── content-addressable IDs ──────────────────────────────────
def node_id(level: int, text: str) -> bytes:
    """BLAKE2b-128 hash — same input produces same ID on any machine."""
    h = hashlib.blake2b(digest_size=16)
    h.update(level.to_bytes(1, "big"))
    h.update(text.encode("utf-8"))
    return h.digest()


# ─── Invariant A — no cycles (SQL recursive CTE) ──────────────
def _check_cycle(conn, new_id: bytes, derived_from: list) -> bool:
    for parent in derived_from:
        row = conn.execute("""
            WITH RECURSIVE ancestors(id) AS (
                SELECT dst FROM edges
                  WHERE src = ? AND predicate = 0
                UNION
                SELECT e.dst FROM edges e
                  JOIN ancestors a ON e.src = a.id
                  WHERE e.predicate = 0
            )
            SELECT 1 FROM ancestors WHERE id = ? LIMIT 1
        """, (parent, new_id)).fetchone()
        if row:
            return False
    return True


# ─── Invariant B — monotonic levels ───────────────────────────
def _check_level(conn, new_level: int, derived_from: list) -> bool:
    if not derived_from:
        return new_level == 0
    parent_levels = []
    for p in derived_from:
        row = conn.execute("SELECT level FROM nodes WHERE id=?", (p,)).fetchone()
        if row is None:
            return False
        parent_levels.append(row[0])
    return new_level == max(parent_levels) + 1


# ─── Invariant D — contradiction detection (pluggable NLI) ────
def _check_contradiction(conn, text: str, emb: np.ndarray, level: int,
                         nli: Callable[[str, str], bool]) -> Optional[bytes]:
    rows = conn.execute(
        "SELECT id, text, embedding FROM nodes WHERE level=? AND tombstone=0",
        (level,)
    ).fetchall()
    for nid, other_text, other_emb_blob in rows:
        other_emb = np.frombuffer(other_emb_blob, dtype=np.float32)
        sim = float(
            np.dot(emb, other_emb) /
            (np.linalg.norm(emb) * np.linalg.norm(other_emb) + 1e-8)
        )
        if sim < 0.85:
            continue
        if nli(text, other_text):
            return nid
    return None


# ─── insert with all three pre-commit invariants ──────────────
def insert_node(conn, embed_fn: Callable[[str], np.ndarray],
                level: int, kind: str, text: str,
                derived_from=None, supersedes=None, confidence: float = 1.0,
                nli_fn: Callable[[str, str], bool] = lambda a, b: False):
    """
    Insert a node, enforcing Invariants A (no cycle), B (monotonic level),
    and D (no silent contradictions). Invariant C (grounding) runs as a
    separate audit via audit_grounding().
    """
    derived_from = derived_from or []
    nid = node_id(level, text)
    now = int(time.time() * 1000)

    # Content-addressable idempotence
    if conn.execute("SELECT 1 FROM nodes WHERE id=?", (nid,)).fetchone():
        return nid

    emb = embed_fn(text).astype(np.float32)

    if not _check_level(conn, level, derived_from):
        raise ValueError(f"Invariant B: level {level} inconsistent with parents")
    if not _check_cycle(conn, nid, derived_from):
        raise ValueError("Invariant A: would introduce cycle")
    conflict = _check_contradiction(conn, text, emb, level, nli_fn)
    if conflict and supersedes != conflict:
        raise ValueError(
            f"Invariant D: contradicts node {conflict.hex()[:8]}. "
            f"Pass supersedes=... or add contradicts edge manually."
        )

    conn.execute(
        "INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,0)",
        (nid, level, KIND[kind], text, confidence, now, now, emb.tobytes())
    )
    for p in derived_from:
        conn.execute("INSERT INTO edges VALUES (?,?,?,?,?)",
                     (nid, p, PRED["derived_from"], 1.0, now))
    if supersedes:
        conn.execute("INSERT INTO edges VALUES (?,?,?,?,?)",
                     (nid, supersedes, PRED["supersedes"], 1.0, now))
        conn.execute("UPDATE nodes SET tombstone=1 WHERE id=?", (supersedes,))
    conn.commit()
    return nid


# ─── Invariant C — grounding audit ────────────────────────────
def audit_grounding(conn, max_depth: int = 5) -> list:
    orphans = []
    high = conn.execute(
        "SELECT id FROM nodes WHERE level>=1 AND tombstone=0"
    ).fetchall()
    for (nid,) in high:
        frontier = [(nid, 0)]
        seen = set()
        grounded = False
        while frontier:
            cur, depth = frontier.pop()
            if cur in seen or depth > max_depth:
                continue
            seen.add(cur)
            lvl = conn.execute(
                "SELECT level FROM nodes WHERE id=?", (cur,)
            ).fetchone()
            if lvl and lvl[0] == 0:
                grounded = True
                break
            kids = conn.execute(
                "SELECT dst FROM edges WHERE src=? AND predicate=0", (cur,)
            ).fetchall()
            frontier.extend((k, depth + 1) for (k,) in kids)
        if not grounded:
            orphans.append(nid)
    return orphans


# ─── reduce pass ──────────────────────────────────────────────
def reduce_pass(conn, embed_fn, generalize_fn: Callable[[list], str],
                level: int, min_cluster: int = 3, sim_threshold: float = 0.55,
                nli_fn=lambda a, b: False) -> int:
    """
    Cluster level-N nodes, call generalize_fn on each cluster of texts,
    insert the result as level-(N+1). Returns the number of promotions.
    """
    rows = conn.execute(
        "SELECT id, text, embedding FROM nodes WHERE level=? AND tombstone=0",
        (level,)
    ).fetchall()
    items = [(nid, t, np.frombuffer(e, dtype=np.float32)) for nid, t, e in rows]

    used = set()
    clusters = []
    for i, (ida, ta, ea) in enumerate(items):
        if ida in used:
            continue
        cluster = [(ida, ta, ea)]
        used.add(ida)
        for idb, tb, eb in items[i+1:]:
            if idb in used:
                continue
            sim = float(np.dot(ea, eb) /
                        (np.linalg.norm(ea) * np.linalg.norm(eb) + 1e-8))
            if sim >= sim_threshold:
                cluster.append((idb, tb, eb))
                used.add(idb)
        if len(cluster) >= min_cluster:
            clusters.append(cluster)

    promoted = 0
    for cluster in clusters:
        texts = [t for _, t, _ in cluster]
        summary = generalize_fn(texts)
        if summary is None or summary.strip().upper().startswith("NONE"):
            continue
        try:
            insert_node(conn, embed_fn,
                        level + 1,
                        KINDS_FOR_LEVEL[min(level + 1, 4)],
                        summary.strip(),
                        derived_from=[c[0] for c in cluster],
                        nli_fn=nli_fn)
            promoted += 1
        except ValueError as e:
            print(f"    skipped cluster: {e}")
    return promoted


# ─── retrieval mode A: abstract-first ─────────────────────────
def retrieve_abstract(conn, embed_fn, query: str,
                      top_level: int = 2, max_depth: int = 3):
    q = embed_fn(query).astype(np.float32)
    rows = conn.execute(
        "SELECT id, text, embedding FROM nodes WHERE level>=? AND tombstone=0",
        (top_level,)
    ).fetchall()
    scored = []
    for nid, txt, eb in rows:
        e = np.frombuffer(eb, dtype=np.float32)
        sim = float(np.dot(q, e) / (np.linalg.norm(q) * np.linalg.norm(e) + 1e-8))
        scored.append((sim, nid, txt))
    scored.sort(reverse=True)
    if not scored:
        return []

    _, root_id, root_text = scored[0]
    result = [(0, root_text)]
    frontier = [(root_id, 1)]
    seen = {root_id}
    while frontier:
        cur, depth = frontier.pop(0)
        if depth > max_depth:
            continue
        kids = conn.execute(
            "SELECT n.id, n.text FROM edges e "
            "JOIN nodes n ON e.dst = n.id "
            "WHERE e.src=? AND e.predicate=0 AND n.tombstone=0",
            (cur,)
        ).fetchall()
        for kid_id, kid_text in kids:
            if kid_id in seen:
                continue
            seen.add(kid_id)
            result.append((depth, kid_text))
            frontier.append((kid_id, depth + 1))
    return result


# ─── retrieval mode B: specific-first ─────────────────────────
def retrieve_specific(conn, embed_fn, query: str,
                      k: int = 3, max_depth: int = 5):
    q = embed_fn(query).astype(np.float32)
    rows = conn.execute(
        "SELECT id, text, embedding FROM nodes WHERE level<=1 AND tombstone=0"
    ).fetchall()
    scored = []
    for nid, txt, eb in rows:
        e = np.frombuffer(eb, dtype=np.float32)
        sim = float(np.dot(q, e) / (np.linalg.norm(q) * np.linalg.norm(e) + 1e-8))
        scored.append((sim, nid, txt))
    scored.sort(reverse=True)

    chains = []
    for _, nid, txt in scored[:k]:
        chain = [txt]
        cur = nid
        for _ in range(max_depth):
            parent = conn.execute(
                "SELECT dst, (SELECT text FROM nodes WHERE id=e.dst) "
                "FROM edges e WHERE e.src=? AND e.predicate=0 LIMIT 1",
                (cur,)
            ).fetchone()
            if not parent:
                break
            cur, ptext = parent
            chain.insert(0, ptext)
        chains.append(chain)
    return chains


# ─── DOT export for Graphviz ──────────────────────────────────
def export_dot(conn, path: str = "belief_dag.dot"):
    nodes = conn.execute(
        "SELECT id, level, text FROM nodes WHERE tombstone=0"
    ).fetchall()
    edges = conn.execute("SELECT src, dst, predicate FROM edges").fetchall()
    colors = ["#888888", "#4A90D9", "#7B68EE", "#E8834A", "#50C878"]
    styles = ["solid", "dashed", "dotted", "bold", "dashed"]
    with open(path, "w") as f:
        f.write('digraph beliefs {\n'
                '  rankdir=BT;\n'
                '  node[shape=box, style=filled, fontname="monospace", fontsize=10];\n')
        for nid, lvl, txt in nodes:
            short = (txt[:55] + "…") if len(txt) > 55 else txt
            short = short.replace('"', r'\"')
            f.write(f'  "{nid.hex()[:8]}" '
                    f'[label="L{lvl}\\n{short}", '
                    f'fillcolor="{colors[min(lvl, 4)]}"];\n')
        for s, d, p in edges:
            f.write(f'  "{s.hex()[:8]}" -> "{d.hex()[:8]}" '
                    f'[style={styles[p]}];\n')
        f.write("}\n")
