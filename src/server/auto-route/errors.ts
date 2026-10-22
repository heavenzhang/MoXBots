/** User-maintained membership is an execution restriction, not a best-effort
 * preference. Admission must surface this error rather than run an excluded
 * current/default model. Ordinary legacy classifier failures still fall back. */
export class AutoRoutePoolUnavailableError extends Error {
  readonly code = 'AUTO_ROUTE_POOL_UNAVAILABLE';
  constructor() {
    super('自动选模候选池中没有可用于当前会话的模型。请在“模型策略”中添加或恢复候选，或手动选择模型后重试。');
    this.name = 'AutoRoutePoolUnavailableError';
  }
}
