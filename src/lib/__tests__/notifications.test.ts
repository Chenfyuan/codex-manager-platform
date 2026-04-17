import { describe, it, expect, beforeEach, vi } from "vitest";

vi.unmock("@/lib/notifications");

const mockSendNotification = vi.fn();
const mockIsPermissionGranted = vi.fn().mockResolvedValue(true);
const mockRequestPermission = vi.fn().mockResolvedValue("granted");

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: (...args: unknown[]) => mockIsPermissionGranted(...args),
  requestPermission: (...args: unknown[]) => mockRequestPermission(...args),
  sendNotification: (...args: unknown[]) => mockSendNotification(...args),
}));

describe("notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPermissionGranted.mockResolvedValue(true);
    vi.resetModules();
  });

  it("notifyTaskComplete sends notification", async () => {
    const { notifyTaskComplete } = await import("@/lib/notifications");
    await notifyTaskComplete("MyAccount", "Fix the bug");
    expect(mockSendNotification).toHaveBeenCalledWith({
      title: expect.stringContaining("MyAccount"),
      body: "Fix the bug",
    });
  });

  it("notifyTaskFailed sends notification", async () => {
    const { notifyTaskFailed } = await import("@/lib/notifications");
    await notifyTaskFailed("MyAccount", "connection timeout");
    expect(mockSendNotification).toHaveBeenCalledWith({
      title: expect.stringContaining("MyAccount"),
      body: "connection timeout",
    });
  });

  it("truncates long messages at 100 chars", async () => {
    const { notifyTaskComplete } = await import("@/lib/notifications");
    const longMsg = "a".repeat(200);
    await notifyTaskComplete("Acc", longMsg);
    const call = mockSendNotification.mock.calls[0][0];
    expect(call.body.length).toBeLessThanOrEqual(103);
  });
});
