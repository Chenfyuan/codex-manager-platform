import { useEffect } from "react";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAccountStore } from "@/stores/accountStore";
import { activateAccount } from "@/lib/tauri";
import { toast } from "@/stores/toastStore";

export function useGlobalShortcut(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const toggleShortcut = "CommandOrControl+Shift+X";

    register(toggleShortcut, async () => {
      const win = getCurrentWindow();
      const visible = await win.isVisible();
      if (visible) {
        const focused = await win.isFocused();
        if (focused) {
          await win.hide();
        } else {
          await win.setFocus();
        }
      } else {
        await win.show();
        await win.setFocus();
      }
    }).catch(() => {});

    const switchShortcuts = ["CommandOrControl+1", "CommandOrControl+2", "CommandOrControl+3", "CommandOrControl+4", "CommandOrControl+5"];

    for (let i = 0; i < switchShortcuts.length; i++) {
      const index = i;
      register(switchShortcuts[i], async () => {
        const { accounts, activeAccountId, setActiveAccountId } = useAccountStore.getState();
        if (index >= accounts.length) return;
        const target = accounts[index];
        if (target.id === activeAccountId) return;
        try {
          await activateAccount(target.id);
          setActiveAccountId(target.id);
          toast("success", `已切换到 ${target.name}`);
        } catch (e) {
          toast("error", `切换失败: ${e}`);
        }
      }).catch(() => {});
    }

    return () => {
      unregister(toggleShortcut).catch(() => {});
      for (const s of switchShortcuts) {
        unregister(s).catch(() => {});
      }
    };
  }, [enabled]);
}
