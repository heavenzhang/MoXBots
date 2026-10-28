/** Legacy persisted tools can lose isError; only native dispatch-error prefixes
 * establish a failure. Error discussion inside a returned report does not. */
export function isSubagentDispatchFailure(result: string | undefined): boolean {
  return /^(?:Error:\s*)?(?:PreToolUse:(?:Agent|Task) hook error\b|Agent type[^\n]{0,160}(?:not found|does not exist)\b|Unknown agent type\b)/i.test(result?.trim() ?? '');
}
