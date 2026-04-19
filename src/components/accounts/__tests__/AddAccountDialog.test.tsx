import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddAccountDialog } from "@/components/accounts/AddAccountDialog";
import { cancelOAuthLogin, startOAuthLogin } from "@/lib/tauri";
import { useAccountStore } from "@/stores/accountStore";

describe("AddAccountDialog", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useAccountStore.setState({ accounts: [], selectedAccountId: null });
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <AddAccountDialog open={false} onClose={onClose} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders dialog title when open", () => {
    render(<AddAccountDialog open={true} onClose={onClose} />);
    expect(screen.getByText("\u6dfb\u52a0\u8d26\u53f7")).toBeInTheDocument();
  });

  it("shows manual tab form elements by default", () => {
    render(<AddAccountDialog open={true} onClose={onClose} />);
    expect(screen.getAllByText("\u8d26\u53f7\u540d\u79f0").length).toBeGreaterThan(0);
  });

  it("shows import tab when initialTab=import", () => {
    render(
      <AddAccountDialog open={true} onClose={onClose} initialTab="import" />,
    );
    expect(screen.getByText(/\u81ea\u52a8\u68c0\u6d4b/)).toBeInTheDocument();
  });

  it("can switch between tabs", async () => {
    const user = userEvent.setup();
    render(<AddAccountDialog open={true} onClose={onClose} />);
    const importBtns = screen.getAllByText("\u5bfc\u5165\u5df2\u6709");
    await user.click(importBtns[0]);
    expect(screen.getByText(/\u81ea\u52a8\u68c0\u6d4b/)).toBeInTheDocument();
  });

  it("submit button is disabled when form empty", () => {
    render(<AddAccountDialog open={true} onClose={onClose} />);
    const submitBtns = screen.getAllByRole("button", { name: "\u6dfb\u52a0" });
    expect(submitBtns[0]).toBeDisabled();
  });

  it("cancel button calls onClose", async () => {
    const user = userEvent.setup();
    render(<AddAccountDialog open={true} onClose={onClose} />);
    const cancelBtns = screen.getAllByText("\u53d6\u6d88");
    await user.click(cancelBtns[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it("selecting OAuth hides API key input", async () => {
    const user = userEvent.setup();
    render(<AddAccountDialog open={true} onClose={onClose} />);
    const oauthBtns = screen.getAllByText("OAuth");
    await user.click(oauthBtns[0]);
    expect(screen.queryByPlaceholderText("sk-...")).not.toBeInTheDocument();
  });

  it("can cancel a pending OAuth login", async () => {
    const user = userEvent.setup();
    let resolveLogin: ((value: string) => void) | undefined;

    vi.mocked(startOAuthLogin).mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );
    vi.mocked(cancelOAuthLogin).mockResolvedValue(true);

    render(<AddAccountDialog open={true} onClose={onClose} />);

    await user.click(screen.getAllByText("OAuth")[0]);
    await user.click(screen.getByRole("button", { name: /打开浏览器登录/ }));
    expect(screen.getByRole("button", { name: /取消等待/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /取消等待/ }));
    expect(cancelOAuthLogin).toHaveBeenCalled();

    resolveLogin?.("{}");
  });
});
