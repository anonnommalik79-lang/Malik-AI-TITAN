/**
 * MALIK Oil AI | PINN / dual-continuum scientific checks.
 *
 * All inputs are MASS in kg integrated over the SAME interval, never bbl/d,
 * standard gas volumes or instantaneous flow rates.  A zero whole-field
 * residual is necessary but is NOT proof of PDE, saturation, or well physics.
 * This library is a deterministic audit primitive, not an AI Proxy simulator.
 */
export type IntegratedMassLedger = {
  /** Phase mass accumulated in continuum over the time step (signed, kg). */
  deltaStorageKg: number
  /** Non-negative total phase mass injected over the time step (kg). */
  injectionKg: number
  /** Non-negative total phase mass produced (kg). */
  productionKg: number
  /** Non-negative phase mass entering via the outer boundary (kg). */
  boundaryInKg: number
  /** Non-negative phase mass leaving via the outer boundary (kg). */
  boundaryOutKg: number
}

export type TwoContinuumPhaseLedger = {
  matrix: IntegratedMassLedger
  fracture: IntegratedMassLedger
  /** Signed intercontinuum phase transfer, +kg from matrix -> fracture. */
  matrixToFractureKg: number
}
export type TwoPhaseMassInput = {
  oil: TwoContinuumPhaseLedger
  water: TwoContinuumPhaseLedger
  /** Absolute tolerance in kg; default intentionally zero. */
  absoluteToleranceKg?: number
  /** Relative tolerance against phase-throughput mass; default 1e-6. */
  relativeTolerance?: number
}
export type PhaseMassAudit = {
  phase: "oil" | "water"
  matrixResidualKg: number
  fractureResidualKg: number
  globalResidualKg: number
  allowedErrorKg: number
  localConservation: boolean
  globalConservation: boolean
}

/** Diagnostic, not a physically certified reservoir simulation. */
export function auditTwoContinuumMass(input: TwoPhaseMassInput): {
  ok: boolean
  method: string
  evidence: "Deterministic Calculation"
  phases: PhaseMassAudit[]
  limitations: string[]
} {
  const absolute = input.absoluteToleranceKg ?? 0
  const relative = input.relativeTolerance ?? 1e-6
  if (![absolute, relative].every(v => Number.isFinite(v) && v >= 0) || relative > 0.1)
    throw new RangeError("Invalid mass-balance tolerances")
  const phases: PhaseMassAudit[] = (["oil", "water"] as const).map((phase) => {
    const entries = input[phase]
    if (!entries || !Number.isFinite(entries.matrixToFractureKg))
      throw new TypeError(`Missing finite ${phase} intercontinuum transfer (kg)`)
    const fields = ["deltaStorageKg", "injectionKg", "productionKg", "boundaryInKg", "boundaryOutKg"] as const
    for (const continuum of ["matrix", "fracture"] as const) {
      const item = entries[continuum]
      if (!item || !fields.every(field => Number.isFinite(item[field])))
        throw new TypeError(`Incomplete or nonfinite ${phase}/${continuum} mass ledger`)
      if (fields.slice(1).some(field => item[field] < 0))
        throw new RangeError(`Negative integrated flow in ${phase}/${continuum}`)
    }
    const netExternal = (flow: IntegratedMassLedger) =>
      flow.injectionKg + flow.boundaryInKg - flow.productionKg - flow.boundaryOutKg
    const matrixExpected = netExternal(entries.matrix) - entries.matrixToFractureKg
    const fractureExpected = netExternal(entries.fracture) + entries.matrixToFractureKg
    const matrixResidualKg = entries.matrix.deltaStorageKg - matrixExpected
    const fractureResidualKg = entries.fracture.deltaStorageKg - fractureExpected
    const globalResidualKg = matrixResidualKg + fractureResidualKg
    const scale = Math.max(1, Math.abs(entries.matrix.deltaStorageKg), Math.abs(entries.fracture.deltaStorageKg),
      ...[entries.matrix, entries.fracture].flatMap(item => [
        item.injectionKg, item.productionKg, item.boundaryInKg, item.boundaryOutKg
      ]), Math.abs(entries.matrixToFractureKg))
    const allowedErrorKg = absolute + relative * scale
    return {
      phase, matrixResidualKg, fractureResidualKg, globalResidualKg, allowedErrorKg,
      localConservation: Math.abs(matrixResidualKg) <= allowedErrorKg && Math.abs(fractureResidualKg) <= allowedErrorKg,
      globalConservation: Math.abs(globalResidualKg) <= allowedErrorKg,
    }
  })
  return {
    ok: phases.every(row => row.localConservation && row.globalConservation),
    method: "Integral phase mass balance: ΔM = injected + boundary_in - produced - boundary_out ± matrix/fracture transfer",
    evidence: "Deterministic Calculation",
    phases,
    limitations: [
      "All mass ledgers must use kg over identical time windows, consistent phase and thermodynamic bases.",
      "A passed aggregate ledger cannot prove local finite-volume/PDE conservation, Darcy flow, saturation limits, capillary pressure or forecast accuracy.",
      "This is an offline plausibility check; never issue well, injector, or PLC/DCS/SCADA commands.",
    ],
  }
}

/** Raw state snapshot only, NOT the training memory, optimizer, graph edges or workspace. */
export function rawStateMemoryBytes(cells: number, channels: number, bytesPerValue: 2 | 4 | 8): number {
  if (!Number.isSafeInteger(cells) || cells < 1 || !Number.isSafeInteger(channels) || channels < 1)
    throw new RangeError("Cell and channel counts must be positive safe integers")
  const result = cells * channels * bytesPerValue
  if (!Number.isSafeInteger(result)) throw new RangeError("Raw state size exceeds safe integer")
  return result
}

/**
 * Model-specific verification contract for rigorous PINN/FNO/GNN/reservoir AI Proxy requests.
 * Guidance is deliberately explicit about what cannot be inferred from a text response.
 */
export function petroleumProxyPhysicsInstruction(prompt: string): string {
  const task = String(prompt || "")
  if (!/(?:\bPINNs?\b|physics.informed|нейросет|нейронн.*оператор|суррогатн.*модел|\bFNO\b|\bGNN\b|\bAI\s*Proxy\b|operator.learning|history.match|гидродинамическ.*(?:цифров|модел)|polymer\s*flood)/iu.test(task)) return ""
  return [
    "PETROLEUM AI PROXY | SCIENTIFIC EVIDENCE CONTRACT:",
    "PHYSICS: For oil/water α and each continuum c in {matrix,fracture}, write phase mass residual R_{α,c} = ∂t(φ_c ρ_α S_{α,c}) + div(ρ_α u_{α,c}) - q_{α,c}^{mass} - T_{α,c}. Darcy velocity u_{α,c} = -K_c k_{rα,c}/μ_α (grad p_{α,c} - ρ_α g grad z). Include S_o+S_w=1, saturation bounds, capillary pressure p_o-p_w=p_c(S_w), initial/boundary/well source constraints. Consistent units and state definitions are essential.",
    "DUAL CONTINUUM: transfer T_{α,m} = -T_{α,f} under a consistent signed convention; include matrix-fracture exchange and well completion source terms. Use face-flux finite-volume reconciliation and phase-specific global IN/OUT balances; a soft PINN residual or automatic differentiation does NOT guarantee local or global conservation.",
    "LOSS: L=λdata Lobs + λmass Lphase-PDE + λDarcy Lflux + λinterface Lmatrix-fracture + λBC Lboundary + λIC Linitial + λcons Ldiscrete-conservation + λsat Lsaturation + λunc Luncertainty; define normalization, units, data weighting, collocation sampling and constrained/integral enforcement. Prevent trivial penalty solutions and model leakage.",
    "GEOMETRY: treat fractures as a discontinuous high-permeability topology, with GNN and well connections where useful; evaluate FNO on structured/coarsened matrix grids, explicitly model cross-continuum exchange. Mere spatial coarsening can erase short-circuit water breakthrough: use locally adaptive/fracture-resolution diagnostics.",
    "HISTORY MATCH: separate 20-year calibration, spatial/temporal holdouts, uncertainty ensembles and true out-of-sample 5-year forecasts; check watercut, breakthrough arrival, pressure, phase rates and mass-balance errors against a high-resolution trusted simulator. State baseline/acceptance thresholds and OOD fallback.",
    "PERFORMANCE: Never claim measured <10-minute runtime, 8xH100 scalability, 0.5 sec per step or milliseconds from a textual design. Give a conditional time budget for PRETRAINING, CALIBRATION/HISTORY MATCHING, ROLLOUT and VALIDATION separately; show number of sequential dependent steps, transfer/communication overhead, throughput and mixed-precision memory cost. Temporal rollout cannot simply parallelize causal dependent steps. Label estimates until profiled on the exact 8 GPU hardware/dataset/model.",
    "MEMORY: as an illustrative verified arithmetic floor, 10^7 cells * 4 float32 channels = 160,000,000 bytes for one RAW state snapshot (not total training memory); activations, optimizer, graph edges, ensembles and gradients may dominate.",
    "POLYMER: concentration does not imply sealed fractures. Assess viscosity/mobility ratio, injectivity, adsorption, retention, shear/thermal/chemical degradation, salinity compatibility, fracture-matrix exchange, coreflood evidence, potential formation damage, recovery uncertainty and HSE constraints. Do not give operational injection setpoints or claim automatic field control.",
    "OPTIMIZATION: formulate expected, risk-sensitive and scenario-based discounted NPV over Brent $50-$95/bbl; model water handling, polymer purchase/injection, lost injectivity, uncertainty, operating constraints, a baseline and human approval. RL/PPO is a candidate, not inherently superior to robust MPC/Bayesian optimization; benchmark against these alternatives.",
    "OUTPUT GATES: show equations and conservation units; a credible architecture and complexity budget; leakage-safe train/validation/test splits; reference-model error targets; ablation study; feasible investment decision; a DEMONSTRATED/NOT DEMONSTRATED statement for each requested throughput/accuracy claim. Do not invent training runs, GPU traces, field data or validation outcomes.",
  ].join("\n")
}
