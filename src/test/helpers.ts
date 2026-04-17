import type { Account } from "@/lib/types";

export function makeAccount(overrides: Partial<Account> = {}): Account {
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
