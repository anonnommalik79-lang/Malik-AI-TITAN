import assert from "node:assert/strict";
import test from "node:test";
import { createUserLock } from "../user-lock.mjs";

test("a competing request cannot release the first request's account lock", () => {
  const lock = createUserLock();
  const first = lock.acquire("account-a");
  assert.equal(typeof first, "function");
  assert.equal(lock.acquire("account-a"), null);
  assert.equal(lock.size(), 1);
  assert.equal(lock.acquire("account-a"), null);
  assert.equal(lock.size(), 1);
  first();
  assert.equal(lock.size(), 0);
  const next = lock.acquire("account-a");
  assert.equal(typeof next, "function");
  first(); // stale release cannot unlock the new request
  assert.equal(lock.acquire("account-a"), null);
  next();
  assert.equal(lock.size(), 0);
});

test("different accounts can proceed independently", () => {
  const lock = createUserLock();
  const a = lock.acquire("a");
  const b = lock.acquire("b");
  assert.equal(lock.size(), 2);
  a();
  assert.equal(lock.acquire("b"), null);
  assert.equal(lock.size(), 1);
  b();
  b();
  assert.equal(lock.size(), 0);
});
