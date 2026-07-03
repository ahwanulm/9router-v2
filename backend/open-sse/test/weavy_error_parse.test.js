import { describe, it, vi, expect } from "vitest";
import weavyAdapter from "../handlers/videoProviders/weavy.js";
import { execFile } from "child_process";

vi.mock("child_process", () => {
  return {
    execFile: vi.fn(),
  };
});

vi.mock("@/lib/localDb", () => ({
  updateProviderConnection: vi.fn(),
}));

describe("Weavy Adapter Error Surfacing", () => {
  it("should intercept execFile error and throw parsed JSON stdout message with token redacted", async () => {
    const mockErr = new Error("Command failed");
    mockErr.stdout = '{"status": "error", "message": "Failed running Grok Imagine Video: Insufficient credits amount for token secret_token_123"}';
    
    // mock execFile implementation
    execFile.mockImplementation((file, args, options, callback) => {
      const cb = typeof options === "function" ? options : callback;
      cb(mockErr, { stdout: mockErr.stdout, stderr: "" });
    });

    const credentials = { email: "test@example.com", accessToken: "secret_token_123" };
    const body = { model: "weavy-grok-imagine-video" };

    await expect(
      weavyAdapter.generate(credentials, "test prompt", body, null)
    ).rejects.toThrow("Failed running Grok Imagine Video: Insufficient credits amount for token [REDACTED_JWT_TOKEN]");
  });

  it("should redact token from stack and stderr of execFile error", async () => {
    const mockErr = new Error("Command failed containing secret_token_123");
    mockErr.stack = "Error: Command failed containing secret_token_123\n at somewhere";
    mockErr.stderr = "stderr output with secret_token_123";
    
    execFile.mockImplementation((file, args, options, callback) => {
      const cb = typeof options === "function" ? options : callback;
      cb(mockErr, { stdout: "", stderr: mockErr.stderr });
    });

    const credentials = { email: "test@example.com", accessToken: "secret_token_123" };
    const body = { model: "weavy-grok-imagine-video" };
    const mockLog = { debug: vi.fn() };

    try {
      await weavyAdapter.generate(credentials, "test prompt", body, mockLog);
      expect.fail("Should have thrown an error");
    } catch (e) {
      expect(e.message).not.toContain("secret_token_123");
      expect(e.message).toContain("[REDACTED_JWT_TOKEN]");
      expect(e.stack).not.toContain("secret_token_123");
      expect(e.stack).toContain("[REDACTED_JWT_TOKEN]");
      expect(e.stderr).not.toContain("secret_token_123");
      expect(e.stderr).toContain("[REDACTED_JWT_TOKEN]");
      expect(mockLog.debug).toHaveBeenCalledWith("WEAVY_VIDEO", expect.stringContaining("[REDACTED_JWT_TOKEN]"));
      expect(mockLog.debug).toHaveBeenCalledWith("WEAVY_VIDEO", expect.not.stringContaining("secret_token_123"));
    }
  });

  it("should redact token from stderr logged in success path", async () => {
    execFile.mockImplementation((file, args, options, callback) => {
      const cb = typeof options === "function" ? options : callback;
      cb(null, { stdout: '{"status": "success", "urls": ["http://video.url"]}', stderr: "python run completed with token secret_token_123 successfully" });
    });

    const credentials = { email: "test@example.com", accessToken: "secret_token_123" };
    const body = { model: "weavy-grok-imagine-video" };
    const mockLog = { debug: vi.fn() };

    const res = await weavyAdapter.generate(credentials, "test prompt", body, mockLog);
    expect(res.urls).toEqual(["http://video.url"]);
    expect(mockLog.debug).toHaveBeenCalledWith("WEAVY_VIDEO", expect.stringContaining("[REDACTED_JWT_TOKEN]"));
    expect(mockLog.debug).toHaveBeenCalledWith("WEAVY_VIDEO", expect.not.stringContaining("secret_token_123"));
  });

  it("should redact token from custom error stack when parsed JSON status is not success", async () => {
    execFile.mockImplementation((file, args, options, callback) => {
      const cb = typeof options === "function" ? options : callback;
      cb(null, { stdout: '{"status": "error", "message": "API error with token secret_token_123"}', stderr: "" });
    });

    const credentials = { email: "test@example.com", accessToken: "secret_token_123" };
    const body = { model: "weavy-grok-imagine-video" };

    try {
      await weavyAdapter.generate(credentials, "test prompt", body, null);
      expect.fail("Should have thrown an error");
    } catch (e) {
      expect(e.message).not.toContain("secret_token_123");
      expect(e.message).toContain("[REDACTED_JWT_TOKEN]");
      expect(e.stack).not.toContain("secret_token_123");
      expect(e.stack).toContain("[REDACTED_JWT_TOKEN]");
    }
  });

  it("should extract status code 403 from Weavy API error message and set err.status", async () => {
    execFile.mockImplementation((file, args, options, callback) => {
      const cb = typeof options === "function" ? options : callback;
      cb(null, { stdout: '{"status": "error", "message": "Execute recipe batch failed (Status 403): {\\"internalErrorCode\\":1076,\\"message\\":\\"fal-ai/sora/image-to-video\\"}"}', stderr: "" });
    });

    const credentials = { email: "test@example.com", accessToken: "secret_token_123" };
    const body = { model: "weavy-sora-2" };

    try {
      await weavyAdapter.generate(credentials, "test prompt", body, null);
      expect.fail("Should have thrown an error");
    } catch (e) {
      expect(e.message).toContain("Execute recipe batch failed (Status 403)");
      expect(e.status).toBe(403);
    }
  });

  it("should extract status code 403 from python subprocess execution error and set err.status", async () => {
    const mockErr = new Error("Command failed: Execute recipe batch failed (Status 403)");
    execFile.mockImplementation((file, args, options, callback) => {
      const cb = typeof options === "function" ? options : callback;
      cb(mockErr, { stdout: "", stderr: "" });
    });

    const credentials = { email: "test@example.com", accessToken: "secret_token_123" };
    const body = { model: "weavy-sora-2" };

    try {
      await weavyAdapter.generate(credentials, "test prompt", body, null);
      expect.fail("Should have thrown an error");
    } catch (e) {
      expect(e.status).toBe(403);
    }
  });
});
