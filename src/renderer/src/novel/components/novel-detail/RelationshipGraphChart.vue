<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Character, Relationship } from '@shared/novel/types'

const props = withDefaults(
  defineProps<{
    relationships: Relationship[]
    characters?: Character[]
    highlightName?: string | null
  }>(),
  {
    characters: () => [],
    highlightName: null,
  }
)

export interface GraphClickPayload {
  x: number
  y: number
}

export interface GraphContextPayload extends GraphClickPayload {
  clientX: number
  clientY: number
}

const emit = defineEmits<{
  (e: 'node-click', payload: GraphClickPayload & { name: string }): void
  (e: 'edge-click', payload: GraphClickPayload & { index: number }): void
  (e: 'node-contextmenu', payload: GraphContextPayload & { name: string }): void
  (e: 'edge-contextmenu', payload: GraphContextPayload & { index: number }): void
  (e: 'canvas-click'): void
}>()

const rootRef = ref<HTMLElement | null>(null)
const width = ref(960)
const height = ref(640)

const NODE_LABEL_Y = 48
/** 节点碰撞半径（含下方名字），保证圆+文字不重叠 */
const NODE_COLLISION_RADIUS = 54
const NODE_MIN_DISTANCE = NODE_COLLISION_RADIUS * 2 + 8
const NODE_PAD = 72

const NODE_COLORS = [
  '#1f7a67',
  '#8eb4a2',
  '#c5a059',
  '#5b8def',
  '#e07a5f',
  '#9b59b6',
  '#2ecc71',
  '#e74c3c',
]

interface NormalizedRel {
  index: number
  from: string
  to: string
  type: string
  description?: string
  raw: Relationship
}

function readName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeRelationship(rel: Relationship, index: number): NormalizedRel | null {
  const extra = rel as Record<string, unknown>
  const from = readName(rel.character_from ?? extra.from ?? extra.source ?? extra.character_a)
  const to = readName(rel.character_to ?? extra.to ?? extra.target ?? extra.character_b)
  if (!from || !to) return null
  return {
    index,
    from,
    to,
    type: readName(rel.relationship_type ?? extra.type ?? extra.relation) || '关系',
    description: rel.description,
    raw: rel,
  }
}

const normalizedRelations = computed(() =>
  props.relationships
    .map((rel, index) => normalizeRelationship(rel, index))
    .filter((item): item is NormalizedRel => Boolean(item))
)

const nodeNames = computed(() => {
  const names = new Set<string>()
  for (const rel of normalizedRelations.value) {
    names.add(rel.from)
    names.add(rel.to)
  }
  for (const character of props.characters) {
    const name = readName(character.name)
    if (name) names.add(name)
  }
  return Array.from(names)
})

const hasGraph = computed(() => nodeNames.value.length > 0)

interface LayoutNode {
  name: string
  x: number
  y: number
  color: string
  portrait?: string
}

interface LayoutEdge {
  index: number
  from: string
  to: string
  type: string
  x1: number
  y1: number
  x2: number
  y2: number
  cx: number
  cy: number
  active: boolean
}

function portraitByName(name: string): string | undefined {
  return props.characters.find((c) => c.name?.trim() === name)?.portrait_url || undefined
}

function nameSeed(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return (hash % 1000) / 1000
}

function initialAngle(name: string, index: number, total: number): number {
  if (total <= 1) return -Math.PI / 2
  const base = (2 * Math.PI * index) / total - Math.PI / 2
  return base + (nameSeed(name) - 0.5) * 0.22
}

interface SimNode extends LayoutNode {
  vx: number
  vy: number
}

const positions = ref<Map<string, { x: number; y: number }>>(new Map())
const dragging = ref<{ name: string; offsetX: number; offsetY: number } | null>(null)
const dragMoved = ref(false)
let layoutSignature = ''

function clampNodePosition(x: number, y: number, w: number, h: number) {
  return {
    x: Math.max(NODE_PAD, Math.min(w - NODE_PAD, x)),
    y: Math.max(NODE_PAD, Math.min(h - NODE_PAD, y)),
  }
}

function resolveCollisions(
  map: Map<string, { x: number; y: number }>,
  names: string[],
  w: number,
  h: number,
  pinnedName?: string | null
) {
  for (let iter = 0; iter < 48; iter += 1) {
    let moved = false
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const nameA = names[i]
        const nameB = names[j]
        const a = map.get(nameA)
        const b = map.get(nameB)
        if (!a || !b) continue

        let dx = b.x - a.x
        let dy = b.y - a.y
        let dist = Math.hypot(dx, dy)
        if (dist < 0.001) {
          const seed = nameSeed(`${nameA}:${nameB}`)
          dx = Math.cos(seed * Math.PI * 2)
          dy = Math.sin(seed * Math.PI * 2)
          dist = 1
        }
        if (dist >= NODE_MIN_DISTANCE) continue

        moved = true
        const push = (NODE_MIN_DISTANCE - dist) / 2
        const nx = dx / dist
        const ny = dy / dist

        if (pinnedName === nameA) {
          b.x += nx * push * 2
          b.y += ny * push * 2
        } else if (pinnedName === nameB) {
          a.x -= nx * push * 2
          a.y -= ny * push * 2
        } else {
          a.x -= nx * push
          a.y -= ny * push
          b.x += nx * push
          b.y += ny * push
        }

        const clampedA = clampNodePosition(a.x, a.y, w, h)
        a.x = clampedA.x
        a.y = clampedA.y
        const clampedB = clampNodePosition(b.x, b.y, w, h)
        b.x = clampedB.x
        b.y = clampedB.y
      }
    }
    if (!moved) break
  }
}

function computeForceLayout(names: string[], w: number, h: number): Map<string, { x: number; y: number }> {
  const cx = w / 2
  const cy = h / 2
  const count = names.length
  const spread = Math.min(w, h) * Math.min(0.44, 0.2 + count * 0.028)

  const nodes: SimNode[] = names.map((name, index) => {
    const angle = initialAngle(name, index, count)
    const jitter = 0.82 + nameSeed(`${name}:r`) * 0.28
    return {
      name,
      x: cx + spread * Math.cos(angle) * jitter,
      y: cy + spread * Math.sin(angle) * jitter,
      vx: 0,
      vy: 0,
      color: NODE_COLORS[index % NODE_COLORS.length],
      portrait: portraitByName(name),
    }
  })

  const nodeIndex = new Map(nodes.map((node, index) => [node.name, index]))
  const links = normalizedRelations.value
    .map((rel) => {
      const source = nodeIndex.get(rel.from)
      const target = nodeIndex.get(rel.to)
      if (source === undefined || target === undefined || source === target) return null
      return { source, target }
    })
    .filter((item): item is { source: number; target: number } => Boolean(item))

  const iterations = Math.min(220, 100 + count * 10)
  const repulsion = 6800 + count * 180
  const linkDistance = Math.min(260, Math.max(NODE_MIN_DISTANCE + 20, spread * 0.78))
  const attraction = 0.016
  const centerStrength = 0.018
  const damping = 0.84

  for (let iter = 0; iter < iterations; iter += 1) {
    for (const node of nodes) {
      node.vx *= damping
      node.vy *= damping
    }

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i]
        const b = nodes[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let dist = Math.hypot(dx, dy)
        if (dist < 0.001) {
          dx = 1
          dy = 0
          dist = 1
        }
        if (dist < NODE_MIN_DISTANCE) {
          const overlapForce = (NODE_MIN_DISTANCE - dist) * 0.42
          const nx = dx / dist
          const ny = dy / dist
          a.vx -= nx * overlapForce
          a.vy -= ny * overlapForce
          b.vx += nx * overlapForce
          b.vy += ny * overlapForce
        }
        const force = repulsion / (dist * dist)
        dx = (dx / dist) * force
        dy = (dy / dist) * force
        a.vx -= dx
        a.vy -= dy
        b.vx += dx
        b.vy += dy
      }
    }

    for (const link of links) {
      const a = nodes[link.source]
      const b = nodes[link.target]
      let dx = b.x - a.x
      let dy = b.y - a.y
      const dist = Math.hypot(dx, dy) || 1
      const force = (dist - linkDistance) * attraction
      dx = (dx / dist) * force
      dy = (dy / dist) * force
      a.vx += dx
      a.vy += dy
      b.vx -= dx
      b.vy -= dy
    }

    for (const node of nodes) {
      node.vx += (cx - node.x) * centerStrength
      node.vy += (cy - node.y) * centerStrength
      node.x += node.vx
      node.y += node.vy
      const clamped = clampNodePosition(node.x, node.y, w, h)
      node.x = clamped.x
      node.y = clamped.y
    }
  }

  const map = new Map<string, { x: number; y: number }>()
  for (const node of nodes) {
    map.set(node.name, { x: node.x, y: node.y })
  }
  resolveCollisions(map, names, w, h)
  return map
}

function buildLayoutSignature(names: string[], w: number, h: number) {
  return `${w}x${h}|${names.join('\u0001')}|${normalizedRelations.value.length}`
}

function rebuildLayout(force = false) {
  const names = nodeNames.value
  const w = width.value
  const h = height.value
  if (!names.length || !w || !h) {
    positions.value = new Map()
    layoutSignature = ''
    return
  }

  const signature = buildLayoutSignature(names, w, h)
  if (!force && signature === layoutSignature && positions.value.size === names.length) return

  layoutSignature = signature
  positions.value = computeForceLayout(names, w, h)
}

const nodeMeta = computed(() => {
  const names = nodeNames.value
  return names.map((name, index) => ({
    name,
    color: NODE_COLORS[index % NODE_COLORS.length],
    portrait: portraitByName(name),
  }))
})

const layout = computed(() => {
  const posMap = positions.value

  const nodes: LayoutNode[] = []
  for (const meta of nodeMeta.value) {
    const pos = posMap.get(meta.name)
    if (!pos) continue
    nodes.push({
      name: meta.name,
      color: meta.color,
      portrait: meta.portrait,
      x: pos.x,
      y: pos.y,
    })
  }

  const nodeMap = new Map(nodes.map((node) => [node.name, node]))

  const edges: LayoutEdge[] = normalizedRelations.value
    .map((rel) => {
      const a = nodeMap.get(rel.from)
      const b = nodeMap.get(rel.to)
      if (!a || !b) return null
      const active =
        Boolean(props.highlightName) &&
        (rel.from === props.highlightName || rel.to === props.highlightName)
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.hypot(dx, dy) || 1
      const nx = -dy / dist
      const ny = dx / dist
      const bend = Math.min(56, dist * 0.14)
      return {
        index: rel.index,
        from: rel.from,
        to: rel.to,
        type: rel.type,
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        cx: mx + nx * bend,
        cy: my + ny * bend,
        active: Boolean(active),
      }
    })
    .filter((item): item is LayoutEdge => Boolean(item))

  return { nodes, edges }
})

function edgePath(edge: LayoutEdge) {
  return `M ${edge.x1} ${edge.y1} Q ${edge.cx} ${edge.cy} ${edge.x2} ${edge.y2}`
}

function clickPosition(event: MouseEvent): GraphClickPayload {
  const root = rootRef.value
  if (!root) return { x: 0, y: 0 }
  const rect = root.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}

function svgPoint(clientX: number, clientY: number): { x: number; y: number } {
  const svg = rootRef.value?.querySelector('svg')
  if (!svg) return { x: 0, y: 0 }
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  const matrix = svg.getScreenCTM()
  if (!matrix) return { x: 0, y: 0 }
  const transformed = point.matrixTransform(matrix.inverse())
  return { x: transformed.x, y: transformed.y }
}

function updateNodePosition(name: string, x: number, y: number) {
  const w = width.value
  const h = height.value
  const next = new Map(positions.value)
  next.set(name, clampNodePosition(x, y, w, h))
  resolveCollisions(next, nodeNames.value, w, h, name)
  positions.value = next
}

function onNodePointerDown(name: string, event: PointerEvent) {
  event.preventDefault()
  event.stopPropagation()
  const pos = positions.value.get(name)
  if (!pos) return
  const pt = svgPoint(event.clientX, event.clientY)
  dragging.value = { name, offsetX: pt.x - pos.x, offsetY: pt.y - pos.y }
  dragMoved.value = false
}

function onDocumentPointerMove(event: PointerEvent) {
  if (!dragging.value) return
  dragMoved.value = true
  const pt = svgPoint(event.clientX, event.clientY)
  updateNodePosition(
    dragging.value.name,
    pt.x - dragging.value.offsetX,
    pt.y - dragging.value.offsetY
  )
}

function onDocumentPointerUp(event: PointerEvent) {
  if (!dragging.value) return
  const { name } = dragging.value
  dragging.value = null
  if (!dragMoved.value) {
    onNodeClick(name, event as unknown as MouseEvent)
  }
  dragMoved.value = false
}

function contextPosition(event: MouseEvent): GraphContextPayload {
  return {
    ...clickPosition(event),
    clientX: event.clientX,
    clientY: event.clientY,
  }
}

function onNodeClick(name: string, event: MouseEvent) {
  emit('node-click', { name, ...clickPosition(event) })
}

function onEdgeClick(index: number, event: MouseEvent) {
  emit('edge-click', { index, ...clickPosition(event) })
}

function onNodeContextMenu(name: string, event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  emit('node-contextmenu', { name, ...contextPosition(event) })
}

function onEdgeContextMenu(index: number, event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  emit('edge-contextmenu', { index, ...contextPosition(event) })
}

function onCanvasClick(event: MouseEvent) {
  const target = event.target as Element | null
  if (target?.closest('.nd-rel-graph__node, .nd-rel-graph__edge, .nd-rel-graph__edge-label')) return
  emit('canvas-click')
}

let resizeObserver: ResizeObserver | null = null

function syncSize() {
  const root = rootRef.value
  if (!root) return
  const parent = root.parentElement
  const parentHeight = parent?.clientHeight ?? 0
  const nextWidth = Math.max(480, Math.floor(root.clientWidth))
  const nextHeight = Math.max(
    520,
    parentHeight > 120 ? parentHeight : Math.floor(nextWidth * 0.72)
  )
  width.value = nextWidth
  height.value = nextHeight
}

onMounted(() => {
  syncSize()
  rebuildLayout(true)
  document.addEventListener('pointermove', onDocumentPointerMove)
  document.addEventListener('pointerup', onDocumentPointerUp)
  document.addEventListener('pointercancel', onDocumentPointerUp)
  if (typeof ResizeObserver !== 'undefined' && rootRef.value) {
    resizeObserver = new ResizeObserver(() => {
      syncSize()
      rebuildLayout()
    })
    resizeObserver.observe(rootRef.value)
    const parent = rootRef.value.parentElement
    if (parent) resizeObserver.observe(parent)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  document.removeEventListener('pointermove', onDocumentPointerMove)
  document.removeEventListener('pointerup', onDocumentPointerUp)
  document.removeEventListener('pointercancel', onDocumentPointerUp)
})

watch(
  () => [width.value, height.value, nodeNames.value.join('\u0001'), normalizedRelations.value.length],
  () => rebuildLayout(),
  { immediate: true }
)

watch(
  () => [props.relationships, props.characters],
  () => rebuildLayout(),
  { deep: true }
)
</script>

<template>
  <div ref="rootRef" class="nd-rel-graph" @click="onCanvasClick">
    <div v-if="!hasGraph" class="nd-rel-graph__empty">
      <p>暂无可展示的角色节点</p>
      <p class="nd-rel-graph__empty-sub">请先在「主要角色」或关系数据中添加角色名称</p>
    </div>

    <svg
      v-else
      class="nd-rel-graph__svg"
      :viewBox="`0 0 ${width} ${height}`"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="人物关系图谱"
    >
      <defs>
        <pattern
          id="nd-rel-grid"
          width="28"
          height="28"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1.5" cy="1.5" r="1.1" fill="currentColor" opacity="0.35" />
        </pattern>
        <clipPath id="nd-rel-portrait-clip">
          <circle cx="0" cy="0" r="28" />
        </clipPath>
        <marker
          id="nd-rel-arrow"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
        </marker>
        <filter id="nd-rel-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" flood-opacity="0.18" />
        </filter>
      </defs>

      <rect
        class="nd-rel-graph__bg"
        x="0"
        y="0"
        :width="width"
        :height="height"
        fill="url(#nd-rel-grid)"
      />

      <g class="nd-rel-graph__edges">
        <path
          v-for="edge in layout.edges"
          :key="`${edge.from}-${edge.to}-${edge.index}`"
          class="nd-rel-graph__edge"
          :class="{ 'nd-rel-graph__edge--active': edge.active, 'nd-rel-graph__edge--dim': highlightName && !edge.active }"
          :d="edgePath(edge)"
          marker-end="url(#nd-rel-arrow)"
          @click.stop="onEdgeClick(edge.index, $event)"
          @contextmenu="onEdgeContextMenu(edge.index, $event)"
        />
      </g>

      <g class="nd-rel-graph__edge-labels">
        <g
          v-for="edge in layout.edges"
          :key="`label-${edge.index}`"
          class="nd-rel-graph__edge-label"
          :transform="`translate(${edge.cx}, ${edge.cy})`"
          @click.stop="onEdgeClick(edge.index, $event)"
          @contextmenu="onEdgeContextMenu(edge.index, $event)"
        >
          <rect
            :x="-Math.max(28, edge.type.length * 5.5)"
            y="-10"
            :width="Math.max(56, edge.type.length * 11)"
            height="20"
            rx="10"
            :class="{ 'nd-rel-graph__edge-label-bg--active': edge.active }"
          />
          <text text-anchor="middle" dominant-baseline="middle">{{ edge.type }}</text>
        </g>
      </g>

      <g class="nd-rel-graph__nodes">
        <g
          v-for="node in layout.nodes"
          :key="node.name"
          class="nd-rel-graph__node"
          :class="{
            'nd-rel-graph__node--active': highlightName === node.name,
            'nd-rel-graph__node--dim': highlightName && highlightName !== node.name,
            'nd-rel-graph__node--dragging': dragging?.name === node.name,
          }"
          :transform="`translate(${node.x}, ${node.y})`"
          filter="url(#nd-rel-glow)"
          @pointerdown.stop="onNodePointerDown(node.name, $event)"
          @click.stop
          @contextmenu="onNodeContextMenu(node.name, $event)"
        >
          <circle r="32" class="nd-rel-graph__node-bg" :style="{ stroke: node.color }" />
          <image
            v-if="node.portrait"
            :href="node.portrait"
            x="-28"
            y="-28"
            width="56"
            height="56"
            clip-path="url(#nd-rel-portrait-clip)"
          />
          <text v-else class="nd-rel-graph__node-initial" :fill="node.color">
            {{ node.name.slice(0, 1) }}
          </text>
          <text class="nd-rel-graph__node-name" :y="NODE_LABEL_Y">{{ node.name }}</text>
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.nd-rel-graph {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 520px;
  overflow: hidden;
}

.nd-rel-graph__svg {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 520px;
  cursor: default;
}

.nd-rel-graph__bg {
  color: color-mix(in srgb, var(--line) 55%, transparent);
}

.nd-rel-graph__edge {
  fill: none;
  stroke: color-mix(in srgb, var(--muted) 45%, var(--line));
  stroke-width: 2;
  color: color-mix(in srgb, var(--muted) 45%, var(--line));
  cursor: pointer;
  transition: stroke 0.18s ease, stroke-width 0.18s ease, opacity 0.18s ease;
}

.nd-rel-graph__edge--active {
  stroke: var(--brand);
  stroke-width: 3;
  color: var(--brand);
}

.nd-rel-graph__edge--dim {
  opacity: 0.28;
}

.nd-rel-graph__edge-label {
  cursor: pointer;
  pointer-events: all;
}

.nd-rel-graph__edge-label rect {
  fill: color-mix(in srgb, var(--surface, #fffcf7) 92%, white);
  stroke: color-mix(in srgb, var(--line) 70%, transparent);
}

.nd-rel-graph__edge-label-bg--active {
  stroke: color-mix(in srgb, var(--brand) 40%, var(--line));
  fill: color-mix(in srgb, var(--brand) 8%, var(--surface, #fffcf7));
}

.nd-rel-graph__edge-label text {
  font-size: 10px;
  font-weight: 650;
  fill: var(--muted);
  pointer-events: none;
}

.nd-rel-graph__node {
  cursor: grab;
  touch-action: none;
  transition: opacity 0.18s ease;
}

.nd-rel-graph__node--dragging {
  cursor: grabbing;
}

.nd-rel-graph__node--dragging .nd-rel-graph__node-bg {
  stroke-width: 3.5;
  filter: drop-shadow(0 4px 12px color-mix(in srgb, #000 18%, transparent));
}

.nd-rel-graph__node--dim {
  opacity: 0.45;
}

.nd-rel-graph__node-bg {
  fill: color-mix(in srgb, var(--surface, #fffcf7) 95%, white);
  stroke-width: 2.5;
}

.nd-rel-graph__node--active .nd-rel-graph__node-bg {
  stroke-width: 3.5;
  fill: color-mix(in srgb, var(--brand) 8%, var(--surface, #fffcf7));
}

.nd-rel-graph__node-initial {
  font-size: 20px;
  font-weight: 700;
  text-anchor: middle;
  dominant-baseline: middle;
  pointer-events: none;
}

.nd-rel-graph__node-name {
  font-size: 13px;
  font-weight: 650;
  fill: var(--text);
  text-anchor: middle;
  pointer-events: none;
}

.nd-rel-graph__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 520px;
  padding: 24px;
  text-align: center;
  color: var(--muted);
}

.nd-rel-graph__empty p {
  margin: 0;
  font-size: var(--text-sm);
}

.nd-rel-graph__empty-sub {
  margin-top: 8px !important;
  font-size: var(--text-xs) !important;
  color: var(--soft);
}
</style>
