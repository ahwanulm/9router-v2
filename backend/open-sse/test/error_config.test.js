import { describe, it } from "vitest";
import assert from "assert";
import { checkFallbackError } from "../services/accountFallback.js";

describe("Error Classification Rules", () => {
  it("should classify 'insufficient credits' with an exhausted cooldown (24 hours)", () => {
    const errorMsg = "Failed running Grok Imagine Video: Insufficient credits amount";
    const result = checkFallbackError(502, errorMsg);
    assert.strictEqual(result.shouldFallback, true);
    assert.strictEqual(result.cooldownMs, 24 * 60 * 60 * 1000); // 24 hours
  });

  it("should classify error with '1076' (Weavy credit/model restriction) with an exhausted cooldown (24 hours)", () => {
    const errorMsg = 'Execute recipe batch failed (Status 403): {"internalErrorCode":1076,"message":"fal-ai/sora/image-to-video"}';
    const result = checkFallbackError(502, errorMsg);
    assert.strictEqual(result.shouldFallback, true);
    assert.strictEqual(result.cooldownMs, 24 * 60 * 60 * 1000); // 24 hours
  });

  it("should classify Weavy token capture failure error with an exhausted cooldown (24 hours)", () => {
    const errorMsg = 'Failed to capture Weavy Firebase ID Token for stephen67376@gemimol.com (Timeout)';
    const result = checkFallbackError(502, errorMsg);
    assert.strictEqual(result.shouldFallback, true);
    assert.strictEqual(result.cooldownMs, 24 * 60 * 60 * 1000); // 24 hours
  });

  it("should classify Weavy 'only available on paid plans' error with an exhausted cooldown (24 hours)", () => {
    const errorMsg = 'Failed running Grok Imagine Video: This is a video model. Video models are only available on paid plans.';
    const result = checkFallbackError(502, errorMsg);
    assert.strictEqual(result.shouldFallback, true);
    assert.strictEqual(result.cooldownMs, 24 * 60 * 60 * 1000); // 24 hours
  });
});
