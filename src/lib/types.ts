export type AuthMethod = "api_key" | "oauth";

export interface Account {
  id: string;
  name: string;
  authMethod: AuthMethod;
  status: string;
  maxThreads: number;
  activeThreads: number;
  createdAt: string;
  lastActiveAt: string | null;
  tag: string | null;
  priority: number;
  modelPreference: string | null;
}

export type PlanType = "plus" | "pro" | "prolite" | "business" | "free" | "unknown";

export interface QuotaInfo {
  email: string | null;
  planType: string;
  primaryUsedPercent: number | null;
  primaryResetsAt: number | null;
  primaryWindowMins: number | null;
  secondaryUsedPercent: number | null;
  secondaryResetsAt: number | null;
  secondaryWindowMins: number | null;
  creditsBalance: string | null;
  error: string | null;
}

export interface ScheduleRule {
  id: number;
  accountId: string;
  startHour: number;
  endHour: number;
  days: string;
  enabled: boolean;
}

export type ScheduleStrategy = "manual" | "balanced" | "priority" | "time_based";

export interface PromptTemplate {
  id: string;
  title: string;
  content: string;
  category: string;
  isFavorite: boolean;
  useCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CodexProcessInfo {
  pid: number;
  cwd: string | null;
  elapsedSecs: number;
  commandArgs: string;
}

export interface SessionSummary {
  id: string;
  filePath: string;
  timestamp: string;
  cwd: string | null;
  source: string | null;
  modelProvider: string | null;
  cliVersion: string | null;
  firstMessage: string | null;
  turnCount: number;
}

export interface SessionMessage {
  role: string;
  content: string;
  timestamp: string | null;
}

export interface CostLineItem {
  name: string;
  usd: number;
}

export interface CostBucket {
  startTime: number;
  endTime: number;
  totalUsd: number;
  lineItems: CostLineItem[];
}

export interface CostsSummary {
  buckets: CostBucket[];
  totalUsd: number;
  days: number;
}

export interface AppSettings {
  theme: "dark" | "light" | "system";
  codexBinaryPath: string | null;
  autoReconnect: boolean;
  maxReconnectAttempts: number;
}

export interface ModelMapping {
  from: string;
  to: string;
}

export interface ProxyProvider {
  id: string;
  name: string;
  providerType: string;
  apiKey: string;
  baseUrl: string;
  models: ModelMapping[];
  enabled: boolean;
}

export interface ProviderStatus {
  id: string;
  name: string;
  enabled: boolean;
  requestCount: number;
  errorCount: number;
}

export interface ProxyStatus {
  running: boolean;
  port: number;
  requestCount: number;
  providers: ProviderStatus[];
}

export interface ProxyLog {
  timestamp: string;
  modelRequested: string;
  modelActual: string;
  provider: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  status: string;
}

export interface RemoteModel {
  id: string;
  displayName: string;
}

export interface OperationLog {
  id: number;
  action: string;
  fromAccount: string | null;
  toAccount: string | null;
  triggerType: string;
  detail: string | null;
  createdAt: string;
}
