import { describe, expect, it } from "vitest";
import { ApiError } from "./apiClient.js";

describe("ApiError", () => {
  it("carries status, code, message and optional requestId", () => {
    const error = new ApiError(404, "NOT_FOUND", "The item was not found.", "req_123");
    expect(error.status).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toBe("The item was not found.");
    expect(error.requestId).toBe("req_123");
    expect(error).toBeInstanceOf(Error);
  });

  it("allows an undefined requestId", () => {
    const error = new ApiError(500, "INTERNAL_ERROR", "Unexpected failure.");
    expect(error.requestId).toBeUndefined();
  });
});
