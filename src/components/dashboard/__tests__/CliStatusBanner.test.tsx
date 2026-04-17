import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CliStatusBanner } from "@/components/dashboard/CliStatusBanner";
import { detectCodexCli } from "@/lib/tauri";

const mockDetect = vi.mocked(detectCodexCli);

describe("CliStatusBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when CLI is found", async () => {
    mockDetect.mockResolvedValue({ found: true, path: "/usr/bin/codex", version: "1.2.3" });
    const { container } = render(<CliStatusBanner />);
    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("shows not-found state with install link", async () => {
    mockDetect.mockResolvedValue({ found: false, path: null, version: null });
    render(<CliStatusBanner />);
    await waitFor(() => {
      expect(screen.getByText("未检测到 Codex CLI")).toBeInTheDocument();
    });
    expect(screen.getByText("安装指南")).toBeInTheDocument();
  });
});
