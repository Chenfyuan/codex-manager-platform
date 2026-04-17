import { create } from "zustand";
import type { Account, QuotaInfo } from "@/lib/types";

interface AccountState {
  accounts: Account[];
  selectedAccountId: string | null;
  activeAccountId: string | null;
  quotas: Record<string, QuotaInfo>;
  quotaLoading: boolean;
  tagFilter: string | null;

  setAccounts: (accounts: Account[]) => void;
  addAccount: (account: Account) => void;
  removeAccount: (id: string) => void;
  updateAccountStatus: (id: string, status: Account["status"]) => void;
  updateAccountName: (id: string, name: string) => void;
  updateAccountTag: (id: string, tag: string | null) => void;
  selectAccount: (id: string | null) => void;
  setActiveAccountId: (id: string | null) => void;
  setQuota: (accountId: string, quota: QuotaInfo) => void;
  setQuotas: (quotas: Record<string, QuotaInfo>) => void;
  setQuotaLoading: (loading: boolean) => void;
  setTagFilter: (tag: string | null) => void;
}

export const useAccountStore = create<AccountState>((set) => ({
  accounts: [],
  selectedAccountId: null,
  activeAccountId: null,
  quotas: {},
  quotaLoading: false,
  tagFilter: null,

  setAccounts: (accounts) => set({ accounts }),

  addAccount: (account) =>
    set((state) => ({ accounts: [...state.accounts, account] })),

  removeAccount: (id) =>
    set((state) => ({
      accounts: state.accounts.filter((a) => a.id !== id),
      selectedAccountId:
        state.selectedAccountId === id ? null : state.selectedAccountId,
      activeAccountId:
        state.activeAccountId === id ? null : state.activeAccountId,
    })),

  updateAccountStatus: (id, status) =>
    set((state) => ({
      accounts: state.accounts.map((a) =>
        a.id === id ? { ...a, status } : a,
      ),
    })),

  updateAccountName: (id, name) =>
    set((state) => ({
      accounts: state.accounts.map((a) =>
        a.id === id ? { ...a, name } : a,
      ),
    })),

  updateAccountTag: (id, tag) =>
    set((state) => ({
      accounts: state.accounts.map((a) =>
        a.id === id ? { ...a, tag } : a,
      ),
    })),

  selectAccount: (id) => set({ selectedAccountId: id }),
  setActiveAccountId: (id) => set({ activeAccountId: id }),

  setQuota: (accountId, quota) =>
    set((state) => ({
      quotas: { ...state.quotas, [accountId]: quota },
    })),

  setQuotas: (quotas) => set({ quotas }),
  setQuotaLoading: (loading) => set({ quotaLoading: loading }),
  setTagFilter: (tag) => set({ tagFilter: tag }),
}));
