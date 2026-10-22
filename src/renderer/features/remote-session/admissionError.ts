const messages: Record<string, string> = {
  REMOTE_PROVIDER_SELECTION_REQUIRED: 'providerSelectionRequired',
  REMOTE_PROVIDER_MODEL_MISMATCH: 'providerModelMismatch',
  REMOTE_PROVIDER_UNAVAILABLE: 'providerUnavailable',
  REMOTE_RUNTIME_PERMISSION_INVALID: 'runtimePermissionInvalid',
  REMOTE_WORKSPACE_CAPABILITIES_UNAVAILABLE: 'workspaceCapabilitiesUnavailable',
  REMOTE_SESSION_QUEUE_FULL: 'queueFull',
  REMOTE_SESSION_ADMISSION_CANCELLED: 'admissionCancelled',
  REMOTE_PREPARED_ADMISSION_FAILED: 'sessionPreparationFailed',
  REMOTE_SESSION_ADMISSION_REJECTED: 'admissionRejected',
  REMOTE_SESSION_DISPATCH_REJECTED: 'dispatchRejected',
};

export function remoteAdmissionErrorKey(code: string | null): string | undefined {
  return code && Object.hasOwn(messages, code) ? messages[code] : undefined;
}
