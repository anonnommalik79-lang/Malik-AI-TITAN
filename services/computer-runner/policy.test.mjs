import assert from "node:assert/strict"
import { test } from "node:test"
import { actionPolicy, publicAddress, publicUrl } from "./policy.mjs"

test("deny private, metadata, local and transition destinations", async () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.1.1", "0.0.0.0", "224.1.1.1", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "2001:db8::1", "2002:7f00:1::1"]) assert.equal(publicAddress(ip), false, ip)
  assert.equal(publicAddress("93.184.216.34"), true)
  await assert.rejects(publicUrl("https://host.example", async () => [{ address: "93.184.216.34" }, { address: "127.0.0.1" }]))
  for (const url of ["http://example.com", "file:///etc/passwd", "https://localhost", "https://user:pass@example.com", "https://example.com:22"]) await assert.rejects(publicUrl(url))
  assert.equal(await publicUrl("https://example.com/page", async () => [{ address: "93.184.216.34" }]), "https://example.com/page")
})
test("navigation is read-only; every fill and button requires exact review", () => {
  assert.equal(actionPolicy({ action: "click" }, { tag: "a", href: "https://example.com", label: "Page" }), "navigate")
  assert.equal(actionPolicy({ action: "click" }, { tag: "button", label: "Send email" }), "confirm")
  assert.equal(actionPolicy({ action: "click" }, { tag: "a", href: "https://example.com", inForm: true }), "confirm")
  assert.equal(actionPolicy({ action: "fill" }, { tag: "textarea", label: "Message" }), "confirm")
  assert.equal(actionPolicy({ action: "fill" }, { tag: "input", type: "password" }), "handoff")
  assert.equal(actionPolicy({ action: "fill" }, { tag: "input", label: "CVV" }), "handoff")
  assert.equal(actionPolicy({ action: "click" }, undefined), "invalid")
  assert.equal(actionPolicy({ action: "evaluate", value: "arbitrary code" }, { tag: "button" }), "invalid")
})
