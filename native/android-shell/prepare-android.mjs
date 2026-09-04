import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const androidRoot = path.join(here, "android")
const appRoot = path.join(androidRoot, "app", "src", "main")
const manifestPath = path.join(appRoot, "AndroidManifest.xml")
const drawableDir = path.join(appRoot, "res", "drawable")
const launcherSource = path.join(here, "resources", "ic_malik_launcher.xml")
const launcherTarget = path.join(drawableDir, "ic_malik_launcher.xml")
const mainActivityPath = path.join(appRoot, "java", "world", "malikai", "app", "MainActivity.java")

if (!fs.existsSync(manifestPath)) {
  throw new Error("Android project is missing. Run: npx cap add android")
}

fs.mkdirSync(drawableDir, { recursive: true })
fs.copyFileSync(launcherSource, launcherTarget)

let manifest = fs.readFileSync(manifestPath, "utf8")

const permissions = [
  "android.permission.RECORD_AUDIO",
  "android.permission.CAMERA",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
]

const missing = permissions.filter((permission) => !manifest.includes(permission))
if (missing.length) {
  const block = missing
    .map((permission) => `    <uses-permission android:name="${permission}" />`)
    .join("\n")
  manifest = manifest.replace(/\n\s*<application\b/, `\n${block}\n\n    <application`)
}

manifest = manifest
  .replace(/android:icon="@mipmap\/ic_launcher"/g, 'android:icon="@drawable/ic_malik_launcher"')
  .replace(/android:roundIcon="@mipmap\/ic_launcher_round"/g, 'android:roundIcon="@drawable/ic_malik_launcher"')

fs.writeFileSync(manifestPath, manifest)

fs.mkdirSync(path.dirname(mainActivityPath), { recursive: true })
fs.writeFileSync(
  mainActivityPath,
  `package world.malikai.app;\n\nimport android.graphics.Color;\nimport android.os.Bundle;\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        super.onCreate(savedInstanceState);\n        getWindow().setStatusBarColor(Color.BLACK);\n        getWindow().setNavigationBarColor(Color.BLACK);\n    }\n}\n`,
)

console.log("Malik AI Android native shell prepared: icon, black system bars and device permissions applied.")
