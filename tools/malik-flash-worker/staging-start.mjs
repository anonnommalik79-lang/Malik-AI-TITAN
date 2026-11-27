// Staging only: report policy and local prerequisites without opening a Google session.
import { googleAccess } from "./google-access.mjs";
import { GoogleBrowserWorker } from "./browser.mjs";

const worker = new GoogleBrowserWorker();
try {
  console.info("[FLASH_STAGING] local prerequisites:", await worker.ready() ? "PASS" : "FAIL");
  try {
    await googleAccess()();
    console.info("[FLASH_STAGING] Google access policy: PASS (not a live answer test)");
  } catch (error) {
    console.warn("[FLASH_STAGING] Google access policy:", error.code || "UNVERIFIED");
  }
} finally {
  await worker.close();
}
await import("./server.mjs");
