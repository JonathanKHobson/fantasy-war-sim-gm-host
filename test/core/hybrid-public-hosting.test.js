import test from "node:test";
import assert from "node:assert/strict";

test("hybrid public-host status can represent quick-tunnel success without fallback", () => {
  const status = {
    status: "running_public",
    tunnelProvider: "quick",
    fallbackAvailable: false,
    fallbackAttempted: false,
    fallbackStatus: "missing",
    verificationStatus: "verified"
  };

  assert.equal(status.tunnelProvider, "quick");
  assert.equal(status.fallbackAttempted, false);
  assert.equal(status.verificationStatus, "verified");
});

test("hybrid public-host status can represent named fallback after quick-tunnel failure", () => {
  const status = {
    status: "running_public",
    tunnelProvider: "named",
    fallbackAvailable: true,
    fallbackAttempted: true,
    fallbackStatus: "running",
    verificationStatus: "verified"
  };

  assert.equal(status.tunnelProvider, "named");
  assert.equal(status.fallbackAttempted, true);
  assert.equal(status.fallbackStatus, "running");
});

test("hybrid public-host status can represent quick failure without a named fallback", () => {
  const status = {
    status: "error",
    tunnelProvider: "quick",
    fallbackAvailable: false,
    fallbackAttempted: false,
    fallbackStatus: "missing",
    verificationStatus: "failed",
    lastError: "Public hosting verification timed out: ENOTFOUND"
  };

  assert.equal(status.status, "error");
  assert.equal(status.tunnelProvider, "quick");
  assert.equal(status.fallbackAvailable, false);
  assert.match(status.lastError, /ENOTFOUND/);
});
