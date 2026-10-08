import assert from "node:assert/strict"
import fs from "node:fs"
const view=fs.readFileSync("components/sovereign/chat-view.tsx","utf8")
const widget=fs.readFileSync("components/sovereign/MalikChatExperience.tsx","utf8")
const styles=fs.readFileSync("components/sovereign/malik-chat-experience.css","utf8")
const checks=[
["real chat home",view.includes("<MalikChatHome onQuickAction={handleQuickAction} />")],
["real depth mode",view.includes("setResponseDepth(next); saveResponseDepth(next)")],
["actual research route",view.includes("onResearchChange={(next) => setResearchMode(next)}") && view.includes('research: researchMode !== "off" ? true : undefined')],
["locked MAX respects plan",widget.includes("canUseUltra(plan)") && widget.includes("locked ? onUpgrade?.() : onDepthChange(id)")],
["accessible research switch",widget.includes('role="switch"') && widget.includes('aria-checked={research !== "off"}')],
["responsive mobile",styles.includes("grid-template-columns:1fr")],
["keyboard and motion accessibility",styles.includes(":focus-visible") && styles.includes("prefers-reduced-motion:reduce")],
["no old gold hero",!view.includes('Malik AI Max</h2>')],
["existing conversation untouched",view.includes("messages.map((message, index) => (")],
]
for(const [name,valid] of checks) {assert.ok(valid,name);console.log("PASS "+name)}
console.log(checks.length+"/"+checks.length+" static chat V7 checks")
