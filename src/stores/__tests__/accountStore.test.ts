import { describe, it, expect, beforeEach } from "vitest";
import { useAccountStore } from "@/stores/accountStore";
import type { Account } from "@/lib/types";

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc-1",
    name: "Test Account",
    authMethod: "api_key",
    status: "disconnected",
    maxThreads: 6,
    activeThreads: 0,
    createdAt: "2025-01-01T00:00:00Z",
    lastActiveAt: null,
    tag: null,
    priority: 0,
    modelPreference: null,
    ...overrides,
  };
}

describe("accountStore", () => {
  beforeEach(() => {
    useAccountStore.setState({ accounts: [], selectedAccountId: null, activeAccountId: null, quotas: {}, quotaLoading: false });
  });

  it("starts with empty state", () => {
    const state = useAccountStore.getState();
    expect(state.accounts).toEqual([]);
    expect(state.selectedAccountId).toBeNull();
  });

  it("setAccounts replaces the list", () => {
    const accounts = [makeAccount(), makeAccount({ id: "acc-2", name: "B" })];
    useAccountStore.getState().setAccounts(accounts);
    expect(useAccountStore.getState().accounts).toHaveLength(2);
  });

  it("addAccount appends", () => {
    useAccountStore.getState().addAccount(makeAccount({ id: "acc-1" }));
    useAccountStore.getState().addAccount(makeAccount({ id: "acc-2" }));
    expect(useAccountStore.getState().accounts).toHaveLength(2);
    expect(useAccountStore.getState().accounts[1].id).toBe("acc-2");
  });

  it("removeAccount filters out by id", () => {
    useAccountStore.getState().setAccounts([
      makeAccount({ id: "a" }),
      makeAccount({ id: "b" }),
    ]);
    useAccountStore.getState().removeAccount("a");
    expect(useAccountStore.getState().accounts).toHaveLength(1);
    expect(useAccountStore.getState().accounts[0].id).toBe("b");
  });

  it("removeAccount clears selectedAccountId if matching", () => {
    useAccountStore.getState().setAccounts([makeAccount({ id: "a" })]);
    useAccountStore.getState().selectAccount("a");
    useAccountStore.getState().removeAccount("a");
    expect(useAccountStore.getState().selectedAccountId).toBeNull();
  });

  it("removeAccount keeps selectedAccountId if not matching", () => {
    useAccountStore.getState().setAccounts([
      makeAccount({ id: "a" }),
      makeAccount({ id: "b" }),
    ]);
    useAccountStore.getState().selectAccount("b");
    useAccountStore.getState().removeAccount("a");
    expect(useAccountStore.getState().selectedAccountId).toBe("b");
  });

  it("updateAccountStatus updates the right account", () => {
    useAccountStore.getState().setAccounts([
      makeAccount({ id: "a", status: "disconnected" }),
      makeAccount({ id: "b", status: "disconnected" }),
    ]);
    useAccountStore.getState().updateAccountStatus("a", "connected");
    const accounts = useAccountStore.getState().accounts;
    expect(accounts[0].status).toBe("connected");
    expect(accounts[1].status).toBe("disconnected");
  });

  it("selectAccount sets id", () => {
    useAccountStore.getState().selectAccount("x");
    expect(useAccountStore.getState().selectedAccountId).toBe("x");
  });

  it("selectAccount with null deselects", () => {
    useAccountStore.getState().selectAccount("x");
    useAccountStore.getState().selectAccount(null);
    expect(useAccountStore.getState().selectedAccountId).toBeNull();
  });
});
