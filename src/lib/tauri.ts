import { invoke } from "@tauri-apps/api/core";
import type { Account, QuotaInfo, PromptTemplate, CodexProcessInfo, SessionSummary, SessionMessage, CostsSummary, ProxyProvider, ProxyStatus, ProxyLog, RemoteModel, OperationLog } from "./types";

export interface CodexCliInfo {
  found: boolean;
  path: string | null;
  version: string | null;
}

export interface SettingsSnapshot {
  cliInfo: CodexCliInfo;
  adminKey: string | null;
  quotaThreshold: number;
  notifyEnabled: boolean;
  autoSwitchEnabled: boolean;
  pollInterval: number;
  scheduleStrategy: import("./types").ScheduleStrategy;
  rules: import("./types").ScheduleRule[];
}

export interface SettingsDiagnostics {
  dbSize: number | null;
  historyCount: number;
  operationLogs: OperationLog[];
}

export async function detectCodexCli(): Promise<CodexCliInfo> {
  return invoke("detect_codex_cli");
}

export async function getSettingsSnapshot(): Promise<SettingsSnapshot> {
  return invoke("get_settings_snapshot");
}

export async function getSettingsDiagnostics(operationLogLimit = 50): Promise<SettingsDiagnostics> {
  return invoke("get_settings_diagnostics", { operationLogLimit });
}

export async function startOAuthLogin(): Promise<string> {
  return invoke("start_oauth_login");
}

export async function cancelOAuthLogin(): Promise<boolean> {
  return invoke("cancel_oauth_login");
}

export async function checkOAuthStatus(): Promise<boolean> {
  return invoke("check_oauth_status");
}

export interface DetectedCredential {
  source: string;
  authMethod: string;
  displayName: string;
  credentialPreview: string;
  credentialValue: string;
}

export async function detectExistingCredentials(): Promise<DetectedCredential[]> {
  return invoke("detect_existing_credentials");
}

export async function importAccount(params: {
  name: string;
  authMethod: string;
  credential: string;
  source: string;
}): Promise<Account> {
  return invoke("import_account", params);
}

export async function updateAccountName(accountId: string, name: string): Promise<void> {
  return invoke("update_account_name", { accountId, name });
}

export async function updateAccountCredential(accountId: string, credential: string): Promise<void> {
  return invoke("update_account_credential", { accountId, credential });
}

export async function getAccounts(): Promise<Account[]> {
  return invoke("get_accounts");
}

export async function addAccount(params: {
  name: string;
  authMethod: "api_key" | "oauth";
  credential: string;
  tag?: string | null;
}): Promise<Account> {
  return invoke("add_account", params);
}

export async function removeAccount(accountId: string): Promise<void> {
  return invoke("remove_account", { accountId });
}

export async function activateAccount(accountId: string): Promise<void> {
  return invoke("activate_account", { accountId });
}

export async function getActiveCredential(): Promise<string | null> {
  return invoke("get_active_credential");
}

export async function getActiveAccountId(): Promise<string | null> {
  return invoke("get_active_account_id");
}

export async function checkQuota(accountId: string): Promise<QuotaInfo> {
  return invoke("check_quota", { accountId });
}

export async function checkAllQuotas(): Promise<Array<[string, QuotaInfo]>> {
  return invoke("check_all_quotas");
}

export async function refreshOAuthToken(accountId: string): Promise<string> {
  return invoke("refresh_oauth_token", { accountId });
}

export async function getQuotaHistory(
  accountId: string,
  limit?: number,
): Promise<Array<[number, number, string]>> {
  return invoke("get_quota_history", { accountId, limit: limit ?? 24 });
}

export async function refreshTrayMenu(): Promise<void> {
  return invoke("refresh_tray_menu");
}

export async function exportAccounts(password: string): Promise<string> {
  return invoke("export_accounts", { password });
}

export async function importAccountsFromBackup(
  encryptedJson: string,
  password: string,
): Promise<number> {
  return invoke("import_accounts_from_backup", { encryptedJson, password });
}

export async function getSetting(key: string): Promise<string | null> {
  return invoke("get_setting", { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  return invoke("set_setting", { key, value });
}

export async function updateAccountTag(accountId: string, tag: string | null): Promise<void> {
  return invoke("update_account_tag", { accountId, tag });
}

export async function getAllTags(): Promise<string[]> {
  return invoke("get_all_tags");
}

export async function getDailyStats(
  days?: number,
): Promise<Array<[string, string, number]>> {
  return invoke("get_daily_stats", { days: days ?? 7 });
}

export async function getAccountUsageSummary(): Promise<Array<[string, number]>> {
  return invoke("get_account_usage_summary");
}

export async function getHourlyActivity(days?: number): Promise<Array<[number, number]>> {
  return invoke("get_hourly_activity", { days: days ?? 7 });
}

export async function getConsumptionRates(): Promise<Array<[string, string, number, number | null]>> {
  return invoke("get_consumption_rates");
}

export async function getScheduleRules(): Promise<import("./types").ScheduleRule[]> {
  return invoke("get_schedule_rules");
}

export async function addScheduleRule(
  accountId: string,
  startHour: number,
  endHour: number,
  days?: string,
): Promise<number> {
  return invoke("add_schedule_rule", { accountId, startHour, endHour, days });
}

export async function removeScheduleRule(ruleId: number): Promise<void> {
  return invoke("remove_schedule_rule", { ruleId });
}

export async function updateAccountPriority(accountId: string, priority: number): Promise<void> {
  return invoke("update_account_priority", { accountId, priority });
}

export async function getRecommendedAccount(strategy: string): Promise<string | null> {
  return invoke("get_recommended_account", { strategy });
}

export async function getTodaySwitchCount(): Promise<number> {
  return invoke("get_today_switch_count");
}

export async function cleanupOldData(days: number): Promise<number> {
  return invoke("cleanup_old_data", { days });
}

export async function getDbSize(): Promise<number> {
  return invoke("get_db_size");
}

export async function getQuotaHistoryCount(): Promise<number> {
  return invoke("get_quota_history_count");
}

export async function updateModelPreference(accountId: string, model: string | null): Promise<void> {
  return invoke("update_model_preference", { accountId, model });
}

export async function isCodexRunning(): Promise<boolean> {
  return invoke("is_codex_running");
}

export async function getCodexProcesses(): Promise<CodexProcessInfo[]> {
  return invoke("get_codex_processes");
}

export async function getAccountLaunchCommand(accountId: string): Promise<string> {
  return invoke("get_account_launch_command", { accountId });
}

export async function getPromptTemplates(): Promise<PromptTemplate[]> {
  return invoke("get_prompt_templates");
}

export async function addPromptTemplate(title: string, content: string, category: string): Promise<PromptTemplate> {
  return invoke("add_prompt_template", { title, content, category });
}

export async function updatePromptTemplate(id: string, title: string, content: string, category: string): Promise<void> {
  return invoke("update_prompt_template", { id, title, content, category });
}

export async function deletePromptTemplate(id: string): Promise<void> {
  return invoke("delete_prompt_template", { id });
}

export async function togglePromptFavorite(id: string): Promise<boolean> {
  return invoke("toggle_prompt_favorite", { id });
}

export async function incrementPromptUseCount(id: string): Promise<void> {
  return invoke("increment_prompt_use_count", { id });
}

export async function getPromptCategories(): Promise<string[]> {
  return invoke("get_prompt_categories");
}

export async function toggleSpotlight(): Promise<void> {
  return invoke("toggle_spotlight");
}

export async function hideSpotlight(): Promise<void> {
  return invoke("hide_spotlight");
}

export async function listCodexSessions(): Promise<SessionSummary[]> {
  return invoke("list_codex_sessions");
}

export async function readCodexSession(filePath: string): Promise<SessionMessage[]> {
  return invoke("read_codex_session", { filePath });
}

export async function fetchOpenaiCosts(days?: number): Promise<CostsSummary> {
  return invoke("fetch_openai_costs", { days: days ?? 7 });
}

export async function proxyStart(port: number): Promise<number> {
  return invoke("proxy_start", { port });
}

export async function proxyStop(): Promise<void> {
  return invoke("proxy_stop");
}

export async function proxyGetStatus(): Promise<ProxyStatus> {
  return invoke("proxy_get_status");
}

export async function proxyGetLogs(limit?: number): Promise<ProxyLog[]> {
  return invoke("proxy_get_logs", { limit: limit ?? 50 });
}

export async function proxyGetProviders(): Promise<ProxyProvider[]> {
  return invoke("proxy_get_providers");
}

export async function proxyAddProvider(params: {
  name: string;
  providerType: string;
  apiKey: string;
  baseUrl: string;
  modelsJson: string;
}): Promise<ProxyProvider> {
  return invoke("proxy_add_provider", params);
}

export async function proxyUpdateProvider(params: {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  modelsJson: string;
  enabled: boolean;
}): Promise<void> {
  return invoke("proxy_update_provider", params);
}

export async function proxyRemoveProvider(id: string): Promise<void> {
  return invoke("proxy_remove_provider", { id });
}

export async function proxyReloadProviders(): Promise<void> {
  return invoke("proxy_reload_providers");
}

export async function proxyFetchRemoteModels(params: {
  providerType: string;
  apiKey: string;
  baseUrl: string;
}): Promise<RemoteModel[]> {
  return invoke("proxy_fetch_remote_models", params);
}

export async function getOperationLogs(limit?: number): Promise<OperationLog[]> {
  return invoke("get_operation_logs", { limit: limit ?? 50 });
}

export async function clearOperationLogs(): Promise<number> {
  return invoke("clear_operation_logs");
}

export async function logOperation(params: {
  action: string;
  fromAccount?: string | null;
  toAccount?: string | null;
  triggerType: string;
  detail?: string | null;
}): Promise<void> {
  return invoke("log_operation", params);
}

export async function reorderAccounts(orderedIds: string[]): Promise<void> {
  return invoke("reorder_accounts", { orderedIds });
}
