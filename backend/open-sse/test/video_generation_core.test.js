import { describe, it, expect, vi } from "vitest";
import { handleVideoGenerationCore } from "../handlers/videoGenerationCore.js";
import { getVideoAdapter } from "../handlers/videoProviders/index.js";

vi.mock("../handlers/videoProviders/index.js", () => ({
  getVideoAdapter: vi.fn(),
  isVideoProvider: vi.fn().mockReturnValue(true),
}));

describe("videoGenerationCore - handleVideoGenerationCore", () => {
  it("should call onRequestSuccess callback on successful generation", async () => {
    const mockAdapter = {
      generate: vi.fn().mockResolvedValue({ urls: ["https://example.com/video.mp4"], genId: "mock-gen-123" }),
    };
    getVideoAdapter.mockReturnValue(mockAdapter);

    const mockOnRequestSuccess = vi.fn();
    const mockOnRequestFailure = vi.fn();
    const mockLog = {
      debug: vi.fn(),
    };

    const options = {
      body: { prompt: "Test prompt" },
      modelInfo: { provider: "mock-provider", model: "mock-model" },
      credentials: { key: "secret" },
      log: mockLog,
      onRequestSuccess: mockOnRequestSuccess,
      onRequestFailure: mockOnRequestFailure,
    };

    const result = await handleVideoGenerationCore(options);
    expect(result.success).toBe(true);

    // Read the stream to trigger execution
    const reader = result.response.body.getReader();
    let streamContent = "";
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      streamContent += decoder.decode(value);
    }

    expect(mockAdapter.generate).toHaveBeenCalledWith(
      options.credentials,
      options.body.prompt,
      { ...options.body, model: "mock-model" },
      mockLog
    );
    expect(mockOnRequestSuccess).toHaveBeenCalled();
    expect(mockOnRequestFailure).not.toHaveBeenCalled();
    expect(streamContent).toContain("mock-model");
    expect(streamContent).toContain("https://example.com/video.mp4");
  });

  it("should call onRequestFailure callback when generation fails", async () => {
    const errorMsg = "API error occurred";
    const mockAdapter = {
      generate: vi.fn().mockRejectedValue(new Error(errorMsg)),
    };
    getVideoAdapter.mockReturnValue(mockAdapter);

    const mockOnRequestSuccess = vi.fn();
    const mockOnRequestFailure = vi.fn();
    const mockLog = {
      debug: vi.fn(),
    };

    const options = {
      body: { prompt: "Test prompt" },
      modelInfo: { provider: "mock-provider", model: "mock-model" },
      credentials: { key: "secret" },
      log: mockLog,
      onRequestSuccess: mockOnRequestSuccess,
      onRequestFailure: mockOnRequestFailure,
    };

    const result = await handleVideoGenerationCore(options);
    expect(result.success).toBe(true);

    // Read the stream to trigger execution
    const reader = result.response.body.getReader();
    let streamContent = "";
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      streamContent += decoder.decode(value);
    }

    expect(mockOnRequestSuccess).not.toHaveBeenCalled();
    expect(mockOnRequestFailure).toHaveBeenCalledWith(expect.any(Error));
    expect(mockOnRequestFailure.mock.calls[0][0].message).toBe(errorMsg);
    expect(mockLog.debug).toHaveBeenCalledWith("VIDEO", expect.stringContaining(errorMsg));
    expect(streamContent).toContain("bad_gateway");
    expect(streamContent).toContain(errorMsg);
  });

  it("should handle error in onRequestFailure callback gracefully", async () => {
    const errorMsg = "API error occurred";
    const mockAdapter = {
      generate: vi.fn().mockRejectedValue(new Error(errorMsg)),
    };
    getVideoAdapter.mockReturnValue(mockAdapter);

    const mockOnRequestSuccess = vi.fn();
    const mockOnRequestFailure = vi.fn().mockRejectedValue(new Error("Callback failed"));
    const mockLog = {
      debug: vi.fn(),
    };

    const options = {
      body: { prompt: "Test prompt" },
      modelInfo: { provider: "mock-provider", model: "mock-model" },
      credentials: { key: "secret" },
      log: mockLog,
      onRequestSuccess: mockOnRequestSuccess,
      onRequestFailure: mockOnRequestFailure,
    };

    const result = await handleVideoGenerationCore(options);
    expect(result.success).toBe(true);

    // Read the stream to trigger execution
    const reader = result.response.body.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(mockOnRequestFailure).toHaveBeenCalled();
    expect(mockLog.debug).toHaveBeenCalledWith(
      "VIDEO",
      "onRequestFailure callback error: Callback failed"
    );
  });
});
