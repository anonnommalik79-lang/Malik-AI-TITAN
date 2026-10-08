/**
 * Layered layout for the Visual Engine network graph (flowcharts, AI and API
 * architectures, pipelines, decision flows).
 *
 * A compact Sugiyama-style layout with no dependency: back edges (retry loops)
 * are set aside, nodes are ranked by longest path, long edges get virtual
 * waypoints so they never cut through a node, crossings are reduced with
 * barycentre sweeps, and edges are drawn orthogonally with their ports spread
 * across a node's side - several arrows into one node arrive side by side.
 * Back edges run along the outside of the graph and come back in from the
 * side, the way a "Retry" loop is drawn by hand.
 *
 * Pure and deterministic: the same block lays out the same on the server and
 * in the browser, and nothing here touches the DOM.
 */

export type LayoutNodeInput = { id: string; label: string; kind?: string }
export type LayoutEdgeInput = { from: string; to: string; label?: string; dashed?: boolean }

export type LaidNode = { id: string; x: number; y: number; w: number; h: number; lines: string[]; kind: string; layer: number }
export type LaidEdge = {
  id: string
  from: string
  to: string
  points: Array<[number, number]>
  label?: string
  labelAt?: [number, number]
  dashed: boolean
  back: boolean
}
export type GraphLayout = { nodes: LaidNode[]; edges: LaidEdge[]; width: number; height: number }

const CHAR_W = 6.7
const LINE_H = 15
const PAD_X = 16
const MIN_W = 108
const MAX_W = 196
const NODE_GAP = 22
const LAYER_GAP = 52
const MARGIN = 18

/** Wrap a label into at most three lines that fit the node's width. */
export function wrapLabel(label: string, maxChars = Math.floor((MAX_W - PAD_X * 2) / CHAR_W)) {
  const words = label.split(/\s+/u).filter(Boolean)
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length <= maxChars || !line) line = next
    else { lines.push(line); line = word }
  }
  if (line) lines.push(line)
  if (lines.length > 3) return [...lines.slice(0, 2), `${lines.slice(2).join(" ").slice(0, maxChars - 1)}…`]
  return lines.map((item) => (item.length > maxChars ? `${item.slice(0, maxChars - 1)}…` : item))
}

function size(label: string) {
  const lines = wrapLabel(label)
  const longest = Math.max(...lines.map((line) => line.length), 4)
  return { lines, w: Math.round(Math.min(MAX_W, Math.max(MIN_W, longest * CHAR_W + PAD_X * 2))), h: 22 + lines.length * LINE_H }
}

export function layoutGraph(nodesInput: LayoutNodeInput[], edgesInput: LayoutEdgeInput[], direction: "down" | "right" = "down"): GraphLayout {
  const ids = nodesInput.map((node) => node.id)
  const index = new Map(ids.map((id, position) => [id, position]))
  const edges = edgesInput.filter((edge) => index.has(edge.from) && index.has(edge.to) && edge.from !== edge.to)

  // 1. Back edges. A loop is broken at the edge that points back to a node the
  // author listed earlier (Validation → Repair "Retry"), but only when that
  // edge really closes a cycle; a DFS then catches any cycle left over.
  const outgoing = new Map<string, LayoutEdgeInput[]>(ids.map((id) => [id, []]))
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]))
  for (const edge of edges) { outgoing.get(edge.from)!.push(edge); indegree.set(edge.to, indegree.get(edge.to)! + 1) }
  const back = new Set<LayoutEdgeInput>()
  const reaches = (start: string, goal: string, skip: LayoutEdgeInput) => {
    const seen = new Set([start])
    const stack = [start]
    while (stack.length) {
      const id = stack.pop()!
      if (id === goal) return true
      for (const edge of outgoing.get(id)!) {
        if (edge === skip || back.has(edge) || seen.has(edge.to)) continue
        seen.add(edge.to)
        stack.push(edge.to)
      }
    }
    return false
  }
  const backwards = edges.filter((edge) => index.get(edge.to)! < index.get(edge.from)!)
    .sort((a, b) => (index.get(b.from)! - index.get(b.to)!) - (index.get(a.from)! - index.get(a.to)!))
  for (const edge of backwards) if (reaches(edge.to, edge.from, edge)) back.add(edge)
  const state = new Map<string, 0 | 1 | 2>()
  const visit = (id: string) => {
    state.set(id, 1)
    for (const edge of outgoing.get(id)!) {
      if (back.has(edge)) continue
      const seen = state.get(edge.to) || 0
      if (seen === 1) back.add(edge)
      else if (seen === 0) visit(edge.to)
    }
    state.set(id, 2)
  }
  for (const id of [...ids.filter((id) => indegree.get(id) === 0), ...ids]) if (!state.get(id)) visit(id)
  const forward = edges.filter((edge) => !back.has(edge))

  // 2. Longest-path layers over the forward edges.
  const layer = new Map<string, number>(ids.map((id) => [id, 0]))
  const pending = new Map<string, number>(ids.map((id) => [id, 0]))
  for (const edge of forward) pending.set(edge.to, pending.get(edge.to)! + 1)
  const queue = ids.filter((id) => pending.get(id) === 0)
  while (queue.length) {
    const id = queue.shift()!
    for (const edge of forward.filter((item) => item.from === id)) {
      layer.set(edge.to, Math.max(layer.get(edge.to)!, layer.get(id)! + 1))
      pending.set(edge.to, pending.get(edge.to)! - 1)
      if (pending.get(edge.to) === 0) queue.push(edge.to)
    }
  }

  // A side entry (a node only fed by a loop, or a second input) sits just above
  // the node it feeds instead of floating at the very top.
  const hasForwardIn = new Set(forward.map((edge) => edge.to))
  const firstRoot = ids.find((id) => !hasForwardIn.has(id))
  for (const id of ids) {
    if (hasForwardIn.has(id) || id === firstRoot) continue
    const next = forward.filter((edge) => edge.from === id).map((edge) => layer.get(edge.to)!)
    if (next.length) layer.set(id, Math.max(layer.get(id)!, Math.min(...next) - 1))
  }

  // 3. Virtual waypoints for edges that skip layers.
  type Item = { id: string; virtual: boolean }
  const layers: Item[][] = []
  const place = (id: string, at: number, virtual: boolean) => { (layers[at] ||= []).push({ id, virtual }) }
  for (const id of ids) place(id, layer.get(id)!, false)
  const chains: Array<{ edge: LayoutEdgeInput; path: string[] }> = []
  for (const edge of forward) {
    const path = [edge.from]
    for (let at = layer.get(edge.from)! + 1; at < layer.get(edge.to)!; at += 1) {
      const virtual = `~${edge.from}>${edge.to}#${at}`
      place(virtual, at, true)
      path.push(virtual)
    }
    path.push(edge.to)
    chains.push({ edge, path })
  }
  const up = new Map<string, string[]>()
  const down = new Map<string, string[]>()
  for (const { path } of chains) {
    for (let step = 1; step < path.length; step += 1) {
      (down.get(path[step - 1]) || down.set(path[step - 1], []).get(path[step - 1])!).push(path[step])
      ;(up.get(path[step]) || up.set(path[step], []).get(path[step])!).push(path[step - 1])
    }
  }

  // 4. Barycentre sweeps reduce crossings.
  const order = new Map<string, number>()
  const renumber = () => layers.forEach((row) => row.forEach((item, position) => order.set(item.id, position)))
  renumber()
  const sweep = (row: Item[], neighbours: Map<string, string[]>) => {
    const score = (item: Item) => {
      const list = neighbours.get(item.id) || []
      return list.length ? list.reduce((sum, id) => sum + order.get(id)!, 0) / list.length : order.get(item.id)!
    }
    row.sort((a, b) => score(a) - score(b) || order.get(a.id)! - order.get(b.id)!)
    row.forEach((item, position) => order.set(item.id, position))
  }
  for (let round = 0; round < 6; round += 1) {
    for (let at = 1; at < layers.length; at += 1) sweep(layers[at], up)
    for (let at = layers.length - 2; at >= 0; at -= 1) sweep(layers[at], down)
  }
  // Loop ends sit at the outer edge of their rows, so a "Retry" arrow can run
  // along the outside and come straight in without crossing other nodes.
  const loopEnds = new Set(edges.filter((edge) => back.has(edge)).flatMap((edge) => [edge.to, edge.from]))
  if (loopEnds.size) {
    for (const row of layers) {
      row.sort((a, b) => Number(loopEnds.has(a.id)) - Number(loopEnds.has(b.id)) || order.get(a.id)! - order.get(b.id)!)
      row.forEach((item, position) => order.set(item.id, position))
    }
  }

  // 5. Coordinates. "main" is the axis across a layer, "cross" runs between layers.
  const horizontal = direction === "right"
  const sizes = new Map<string, { lines: string[]; w: number; h: number }>()
  for (const node of nodesInput) sizes.set(node.id, size(node.label))
  const extent = (id: string) => {
    const box = sizes.get(id)
    if (!box) return 8
    return horizontal ? box.h : box.w
  }
  const thickness = (id: string) => {
    const box = sizes.get(id)
    if (!box) return 0
    return horizontal ? box.w : box.h
  }
  const center = new Map<string, number>()
  for (const row of layers) {
    let cursor = 0
    for (const item of row) { center.set(item.id, cursor + extent(item.id) / 2); cursor += extent(item.id) + (item.virtual ? 10 : NODE_GAP) }
  }
  // Pull each node towards the average of its neighbours, then push apart to
  // keep order and spacing. Alternate directions so both ends settle.
  const settle = (row: Item[], neighbours: Map<string, string[]>) => {
    const desired = row.map((item) => {
      const list = neighbours.get(item.id) || []
      return list.length ? list.reduce((sum, id) => sum + center.get(id)!, 0) / list.length : center.get(item.id)!
    })
    const placed = desired.slice()
    for (let at = 1; at < row.length; at += 1) {
      const min = placed[at - 1] + extent(row[at - 1].id) / 2 + (row[at - 1].virtual || row[at].virtual ? 10 : NODE_GAP) + extent(row[at].id) / 2
      placed[at] = Math.max(placed[at], min)
    }
    // Recentre the row on what it wanted, so a push does not drift one way.
    const shift = (desired.reduce((a, b) => a + b, 0) - placed.reduce((a, b) => a + b, 0)) / Math.max(1, row.length)
    row.forEach((item, at) => center.set(item.id, placed[at] + shift))
  }
  for (let round = 0; round < 4; round += 1) {
    for (let at = 1; at < layers.length; at += 1) settle(layers[at], up)
    for (let at = layers.length - 2; at >= 0; at -= 1) settle(layers[at], down)
  }

  const layerThickness = layers.map((row) => Math.max(...row.map((item) => thickness(item.id)), 0))
  const layerStart: number[] = []
  let crossCursor = MARGIN
  layerThickness.forEach((value, at) => { layerStart[at] = crossCursor; crossCursor += value + (horizontal ? LAYER_GAP + 26 : LAYER_GAP) })

  let minMain = Infinity
  let maxMain = -Infinity
  for (const row of layers) for (const item of row) {
    minMain = Math.min(minMain, center.get(item.id)! - extent(item.id) / 2)
    maxMain = Math.max(maxMain, center.get(item.id)! + extent(item.id) / 2)
  }
  const offset = MARGIN - minMain

  const laidNodes: LaidNode[] = []
  const pointOf = new Map<string, { main: number; cross: number; at: number }>()
  layers.forEach((row, at) => row.forEach((item) => {
    const main = center.get(item.id)! + offset
    const crossMid = layerStart[at] + layerThickness[at] / 2
    pointOf.set(item.id, { main, cross: crossMid, at })
    if (item.virtual) return
    const box = sizes.get(item.id)!
    const node = nodesInput.find((entry) => entry.id === item.id)!
    laidNodes.push({
      id: item.id,
      kind: node.kind || "process",
      layer: at,
      lines: box.lines,
      w: box.w,
      h: box.h,
      x: horizontal ? crossMid - box.w / 2 : main - box.w / 2,
      y: horizontal ? main - box.h / 2 : crossMid - box.h / 2,
    })
  }))
  const nodeById = new Map(laidNodes.map((node) => [node.id, node]))
  const toXY = (main: number, cross: number): [number, number] => (horizontal ? [cross, main] : [main, cross])

  // Ports: spread the arrows that leave or enter one side of a node.
  const portSlots = new Map<string, number>()
  const portCount = new Map<string, number>()
  const portKey = (id: string, side: "out" | "in") => `${id}:${side}`
  for (const { path } of chains) {
    portCount.set(portKey(path[0], "out"), (portCount.get(portKey(path[0], "out")) || 0) + 1)
    portCount.set(portKey(path[path.length - 1], "in"), (portCount.get(portKey(path[path.length - 1], "in")) || 0) + 1)
  }
  const sortedChains = [...chains].sort((a, b) => pointOf.get(a.path[1])!.main - pointOf.get(b.path[1])!.main || pointOf.get(a.path[a.path.length - 2])!.main - pointOf.get(b.path[b.path.length - 2])!.main)
  const port = (id: string, side: "out" | "in") => {
    const key = portKey(id, side)
    const count = portCount.get(key) || 1
    const slot = portSlots.get(key) || 0
    portSlots.set(key, slot + 1)
    const width = extent(id)
    const usable = Math.min(width - 24, (count - 1) * 26)
    return pointOf.get(id)!.main + (count > 1 ? -usable / 2 + (usable * slot) / (count - 1) : 0)
  }

  const laidEdges: LaidEdge[] = []
  const gapMid = (at: number) => layerStart[at] + layerThickness[at] + (horizontal ? LAYER_GAP + 26 : LAYER_GAP) / 2
  for (const { edge, path } of sortedChains) {
    const points: Array<[number, number]> = []
    const startAt = pointOf.get(path[0])!.at
    const fromMain = port(path[0], "out")
    const toMain = port(path[path.length - 1], "in")
    points.push(toXY(fromMain, layerStart[startAt] + thickness(path[0]) / 2 + layerThickness[startAt] / 2))
    let main = fromMain
    for (let step = 1; step < path.length; step += 1) {
      const at = pointOf.get(path[step])!.at
      const nextMain = step === path.length - 1 ? toMain : pointOf.get(path[step])!.main
      const turn = gapMid(at - 1)
      points.push(toXY(main, turn), toXY(nextMain, turn))
      if (step < path.length - 1) points.push(toXY(nextMain, layerStart[at] + layerThickness[at]))
      main = nextMain
    }
    const endAt = pointOf.get(path[path.length - 1])!.at
    points.push(toXY(toMain, layerStart[endAt] + layerThickness[endAt] / 2 - thickness(path[path.length - 1]) / 2))
    // Fix the first point to the source's real edge.
    const sourceBox = nodeById.get(path[0])!
    points[0] = horizontal ? [sourceBox.x + sourceBox.w, fromMain] : [fromMain, sourceBox.y + sourceBox.h]
    const target = nodeById.get(path[path.length - 1])!
    points[points.length - 1] = horizontal ? [target.x, toMain] : [toMain, target.y]
    const clean = points.filter((point, at) => at === 0 || point[0] !== points[at - 1][0] || point[1] !== points[at - 1][1])
    // The label sits on the last straight run into the target.
    const a = clean[clean.length - 2] || clean[0]
    const b = clean[clean.length - 1]
    laidEdges.push({
      id: `${edge.from}->${edge.to}`,
      from: edge.from,
      to: edge.to,
      points: clean,
      label: edge.label,
      labelAt: edge.label ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : undefined,
      dashed: Boolean(edge.dashed),
      back: false,
    })
  }

  // Back edges: out of the source's far side, along an outer lane, back in.
  let lane = 0
  let outer = horizontal ? Math.max(...laidNodes.map((node) => node.y + node.h)) : Math.max(...laidNodes.map((node) => node.x + node.w))
  for (const edge of edges.filter((item) => back.has(item))) {
    const source = nodeById.get(edge.from)!
    const target = nodeById.get(edge.to)!
    const laneAt = outer + 22 + lane * 16
    lane += 1
    const points: Array<[number, number]> = horizontal
      ? [[source.x + source.w / 2, source.y + source.h], [source.x + source.w / 2, laneAt], [target.x + target.w / 2 + 10, laneAt], [target.x + target.w / 2 + 10, target.y + target.h]]
      : [[source.x + source.w, source.y + source.h / 2], [laneAt, source.y + source.h / 2], [laneAt, target.y + target.h / 2 + 8], [target.x + target.w, target.y + target.h / 2 + 8]]
    laidEdges.push({
      id: `${edge.from}->${edge.to}`,
      from: edge.from,
      to: edge.to,
      points,
      label: edge.label,
      labelAt: edge.label ? [(points[1][0] + points[2][0]) / 2, (points[1][1] + points[2][1]) / 2] : undefined,
      dashed: edge.dashed !== false,
      back: true,
    })
  }
  if (lane) outer += 22 + lane * 16 + 30

  const width = horizontal ? crossCursor - (LAYER_GAP + 26) + MARGIN : Math.max(maxMain - minMain + MARGIN * 2, lane ? outer + MARGIN : 0)
  const height = horizontal ? Math.max(maxMain - minMain + MARGIN * 2, lane ? outer + MARGIN : 0) : crossCursor - LAYER_GAP + MARGIN
  return { nodes: laidNodes, edges: laidEdges, width: Math.ceil(width), height: Math.ceil(height) }
}
