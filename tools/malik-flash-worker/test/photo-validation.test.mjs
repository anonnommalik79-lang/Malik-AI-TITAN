import assert from "node:assert/strict";
import test from "node:test";
import { normalizePhotos } from "../photo.mjs";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";

test("photo payload uses mime/base64 and preserves original PNG bytes", () => {
  const [photo] = normalizePhotos([{ mime: "image/png", base64: png, name: "my photo.png" }]);
  assert.equal(photo.mimeType, "image/png");
  assert.equal(photo.buffer.toString("base64"), png);
  assert.equal(photo.name, "my_photo.png");
});

test("photo payload rejects wrong keys, wrong declared MIME, and corrupt base64", () => {
  assert.throws(() => normalizePhotos([{ mimeType: "image/png", data: png }]), { code: "INVALID_IMAGE" });
  assert.throws(() => normalizePhotos([{ mime: "image/jpeg", base64: png }]), { code: "IMAGE_MIME_MISMATCH" });
  assert.throws(() => normalizePhotos([{ mime: "image/png", base64: "%%%%" }]), { code: "INVALID_IMAGE_DATA" });
});

test("photo payload enforces maximum four images and five megabytes each", () => {
  assert.throws(() => normalizePhotos(Array(5).fill({ mime: "image/png", base64: png })), { code: "TOO_MANY_IMAGES" });
  const tooLarge = Buffer.concat([Buffer.from(png, "base64"), Buffer.alloc(5 * 1024 * 1024)]).toString("base64");
  assert.throws(() => normalizePhotos([{ mime: "image/png", base64: tooLarge }]), { code: "INVALID_IMAGE_DATA" });
});
