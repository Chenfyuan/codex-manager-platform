import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

let permissionChecked = false;
let hasPermission = false;

async function ensurePermission(): Promise<boolean> {
  if (permissionChecked) return hasPermission;
  hasPermission = await isPermissionGranted();
  if (!hasPermission) {
    const result = await requestPermission();
    hasPermission = result === "granted";
  }
  permissionChecked = true;
  return hasPermission;
}

export async function notifyTaskComplete(accountName: string, prompt: string) {
  if (!(await ensurePermission())) return;
  sendNotification({
    title: `任务完成 — ${accountName}`,
    body: prompt.length > 100 ? prompt.slice(0, 100) + "..." : prompt,
  });
}

export async function notifyTaskFailed(accountName: string, error: string) {
  if (!(await ensurePermission())) return;
  sendNotification({
    title: `任务失败 — ${accountName}`,
    body: error.length > 100 ? error.slice(0, 100) + "..." : error,
  });
}

export async function notifyQuotaWarning(accountName: string, remaining: number) {
  if (!(await ensurePermission())) return;
  sendNotification({
    title: `额度预警 — ${accountName}`,
    body: `剩余额度 ${remaining}%，即将耗尽`,
  });
}
