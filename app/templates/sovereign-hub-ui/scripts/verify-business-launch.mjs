import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8")
const ui = read("components/sovereign/business/CompanyLaunchPad.tsx")
const agents = read("components/sovereign/business/AutonomousCompany.tsx")
const api = read("app/api/business/build-project/route.ts")
const deploy = read("app/api/business/deploy-project/route.ts")
const dashboard = read("components/sovereign/dashboard.tsx")
const checks = [
  [ui, "buildAll = useCallback"],
  [ui, "await buildNextProject(previewHtml)"],
  [ui, "loadedKey !== storageKey"],
  [ui, "malik-autonomous-product:v2"],
  [ui, "projectDeployId"],
  [ui, "props.canDeploy ?"],
  [ui, "Синтаксис проверен"],
  [agents, "malik-business-checkpoint:v2"],
  [agents, "localStorage.setItem(checkpointKey"],
  [agents, "localStorage.removeItem(checkpointKey"],
  [agents, "canDeploy={plan === \"owner\"}"],
  [dashboard, "accountId={workOSUser?.id}"],
  [api, "ts.transpileModule"],
  [api, "buildVerified: false"],
  [deploy, "export async function GET"],
  [deploy, "buildVerified: state === \"READY\""],
]
for (const [source, piece] of checks) assert.ok(source.includes(piece), "Missing safeguard: " + piece)
console.log(checks.length + " business launch integration safeguards: OK")
