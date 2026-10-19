/** Opaque Query incarnation and the exact SDK run the user inspected. */
export type BackgroundTaskContinuationIdentity = { taskId: string; runId: string; queryId: string };

/** Runtime-owned background task detail. Paths never cross the API boundary. */
export type BackgroundTaskDetail = {
  taskId: string;
  toolUseId: string;
  runId?: string;
  continuation?: { identity: BackgroundTaskContinuationIdentity; acknowledged: boolean };
  description?: string;
  taskType?: string;
  status: 'running' | 'completed' | 'failed' | 'stopped' | 'unknown';
  startedAt?: number;
  finishedAt?: number;
  command?: string;
  summary?: string;
  output: string;
  outputState: 'ready' | 'empty' | 'missing' | 'unavailable';
  truncated: boolean;
  totalBytes: number;
  updatedAt: number;
};

export type BackgroundTaskDetailResult =
  | { success: true; task: BackgroundTaskDetail }
  | { success: false; errorCode: string };
