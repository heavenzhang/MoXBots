import ProjectContextBadge from '@/features/project-spaces/ProjectContextBadge';
import { SessionRecoveryPanels } from '../components/SessionRecoveryPanels';
import { RECOVERY_REVIEW_ACTIONS_PATH, RECOVERY_RECONCILE_PATH, type RecoveryActionSnapshot } from '../../shared/recoveryReconciliation';
import { SessionTaskOrchestrationProvider, useSessionTaskOrchestrationContext } from '@/components/agent-status/useSessionTaskOrchestration';
import { SessionTaskActionsContext, resolveTaskActionTargets, type TaskReviewTarget } from '@/components/agent-status/SessionTaskActionsContext';
import SessionTaskResults from '@/components/agent-status/SessionTaskResults';
import { isComposerUpdateCheckpointLocked } from '@/utils/composerUpdateCheckpoint';
import type { ContinuationRequest } from '@/components/SessionContinuationBanner';
import { matchesSessionContinuation, SESSION_CONTINUATION_PROMPT } from '../../shared/sessionContinuation';
import { NativeResumeRecoveryAction } from '@/components/NativeResumeRecoveryAction';
import { NATIVE_RESUME_BOUNDARY_MESSAGE } from '../../shared/nativeResumeBoundary';
import { projectErrorMessageResend, projectErrorRecovery, type ErrorRecovery } from './errorMessageResend';
import { ErrorRecoveryAction } from '@/components/ErrorRecoveryAction';
import { useChatDraftScope } from "@/hooks/useChatDraftScope";
import type { SessionPlanTarget } from '../../shared/sessionPlanConfirmation';
import { useNextPromptSuggestion } from '@/hooks/useNextPromptSuggestion';
import TaskDiscussionRecovery from "@/components/TaskDiscussionRecovery";
import type { AskUserQuestionAnswers } from '../../shared/types/askUserQuestion';
import {
  AsyncQuestionContext,
  type AsyncQuestionActions,
} from '@/context/AsyncQuestionContext';
import { AsyncQuestionComposerTarget } from '@/components/AsyncQuestionCard';
import {
  restoreAsyncQuestionAnswerDraft,
  sameAsyncQuestionReply,
  type AsyncQuestionReply,
} from '../../shared/asyncUserQuestions';
import { isImeComposingEvent } from '@/utils/imeKeyboard';
import type { FilePreviewHandle } from '@/components/FilePreviewModal';
import {
  WarningIcon,
  HelperIcon,
  GlobeIcon,
  HistoryIcon,
  LoaderIcon,
  ComposeIcon,
  PanelRightIcon,
  TerminalIcon,
  CloseIcon,
} from '@/components/icons';
import {
  forwardRef,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { track } from '@/analytics';
import type { HistoryEntrySource } from '@/analytics';
import { useCloseLayer } from '@/hooks/useCloseLayer';
import ConfirmDialog from '@/components/ConfirmDialog';
import BotIdentityButton from '@/components/launcher/BotIdentityButton';
import { useToast } from '@/components/Toast';
import {
  classifyRewindTransportOutcome,
  getConversationRejectionMessage,
  projectRewindRecovery,
  type RewindResponse,
  warnRewindFileOutcome as showRewindFileOutcomeWarning,
} from '@/utils/rewindFileOutcome';
import Tip from '@/components/Tip';
import DirectoryPanel, {
  type DirectoryPanelHandle,
  type WorkspaceTreePersistedState,
} from '@/components/DirectoryPanel';
import DropZoneOverlay from '@/components/DropZoneOverlay';
import OverlayBackdrop from '@/components/OverlayBackdrop';
import MessageList from '@/components/MessageList';
import type { Message as MessageType } from '@/types/chat';
import SessionHistoryDropdown from '@/components/SessionHistoryDropdown';
import SessionSurfaceTags from '@/components/SessionSurfaceTags';
import SessionMenuButton, {
  type BotChannelCandidate,
} from '@/components/SessionMenuButton';
import { sessionMenuRuntimeIdentity } from '@/utils/sessionMenuRuntime';
import UserTagPills from '@/components/session-tags/UserTagPills';
import { FileActionProvider } from '@/context/FileActionContext';
import SimpleChatInput, {
  type ImageAttachment,
  type SimpleChatInputHandle,
} from '@/components/SimpleChatInput';
import type { SlashCommand as InputSlashCommand } from '@/components/SlashCommandMenu';
import SubagentInspector from '@/components/agent-status/SubagentInspector';
import ContextUsageIndicator from '@/components/ContextUsageIndicator';
import ChatBootOverlay from '@/components/ChatBootOverlay';
import { useChatStartupOverlay } from '@/hooks/useChatStartupOverlay';
import { restoreMessageImages } from '@/context/userImageAttachmentProjection';
import {
  sessionConfigPushFingerprint,
  shouldPushSessionConfig,
  type SessionConfigPushMode,
} from '@/utils/sessionConfigPushPolicy';
import QueryNavigator from '@/components/chat/QueryNavigator';
import ChatSearchPanel from '@/components/ChatSearchPanel';
import { useChatSearch, isHighlightApiSupported } from '@/hooks/useChatSearch';
import { useBrowserResourceReady } from '@/hooks/useBrowserResourceReady';
import SelectionCommentMenu from '@/components/SelectionCommentMenu';
import TerminalReasonBanner from '@/components/TerminalReasonBanner';
import RuntimeDiagnosticsBanner from '@/components/RuntimeDiagnosticsBanner';
import { UnifiedLogsPanel } from '@/components/UnifiedLogsPanel';
import WorkspaceConfigPanel, {
  type Tab as WorkspaceTab,
} from '@/components/WorkspaceConfigPanel';
import CronTaskSettingsModal, {
  GOAL_SLASH_PRESET,
  type CronInitialConfig,
  type CronSettingsResult,
} from '@/components/cron/CronTaskSettingsModal';
import { useTabState, useTabActive } from '@/context/TabContext';
import { useChatScrollController } from '@/hooks/useChatScrollController';
import { useChatScrollModel } from '@/hooks/useChatScrollModel';
import { useAgentStatuses } from '@/hooks/useAgentStatuses';
import { useProjectCapabilities } from '@/hooks/useProjectCapabilities';
import {
  useSessionSurfaces,
  type ChannelSurface,
} from '@/hooks/useSessionSurfaces';
import {
  actions as taskCenterActions,
  resolveFloatingBallBoundSession,
} from '@/hooks/taskCenterStore';
import { usePassiveSessionMetadata } from '@/hooks/useTaskCenterData';
import { sameSessionUserTags } from '../../shared/session-user-tags';
import { useConfig } from '@/hooks/useConfig';
import { useFileDropZone } from '@/hooks/useFileDropZone';
import { useTauriFileDrop } from '@/hooks/useTauriFileDrop';
import { useCronTask } from '@/hooks/useCronTask';
import { useSessionGoal } from '@/hooks/useSessionGoal';
import { useWorkspaceFileService } from '@/hooks/useWorkspaceFileService';
import { useWorkspaceChangeSignal } from '@/hooks/useWorkspaceChangeSignal';
import {
  isIntroductionAbsentError,
  shouldShowIntroductionOverlay,
  useIntroductionContent,
} from '@/hooks/useIntroductionContent';
import { resolveAdoptedBuiltinProviderId } from '@/utils/sessionConfigAdoption';
import {
  createAndStartCronTask,
  startCronTask as startCronTaskIpc,
} from '@/api/cronTaskClient';
import { updateSession as patchSessionMetadata } from '@/api/sessionClient';
import {
  sessionHasPersistentOwners,
} from '@/api/tauriClient';
import {
  persistInputOptionChange,
  type BuiltinModelSelection,
  type BuiltinProviderEnvPolicy,
} from '@/api/persistInputOption';
import { materializePendingSessionConfig } from '@/api/sessionMaterialize';
import { ensureChatOwner as ensureChatOwnerTransaction, type ChatOwnerFlight } from './ensureChatOwner';
import type { CronTask } from '@/types/cronTask';
import type { SessionGoal, SessionGoalDraftConfig } from '@/types/sessionGoal';
import { isTerminalGoalStatus } from '@/types/sessionGoal';
import { formatCronScheduleDescription } from '@/utils/cronTaskI18n';
import CronTaskCard from '@/components/scheduled-tasks/CronTaskCard';
import CronTaskDetailPanel from '@/components/CronTaskDetailPanel';
import { projectTaskExecutionOverrides } from '@/utils/taskProviderProjection';
import { isTauriEnvironment } from '@/utils/browserMock';
import { useSessionCronRestore } from '@/hooks/useSessionCronRestore';
import { isDebugMode } from '@/utils/debug';
import { getChannelTypeLabel } from '@/utils/taskCenterUtils';
import { appendCronPromptToDraft } from '@/utils/cronComposerRecovery';
import { runtimeModelCatalogPath } from '@/utils/runtimeModelCatalog';
import { launchSupportDiagnostics } from '@/utils/supportDiagnostics';
import { createDefaultSessionGoalDraftConfig } from '@/utils/sessionGoalDraft';
import type { ComposerWorkflowDraft } from '@/utils/composerWorkflowDraft';
import { MANAGED_CODEX_COMPACT_SLASH_COMMAND } from '@/utils/slashActions';
import {
  CODEX_SUBSCRIPTION_PROVIDER_ID,
  type PermissionMode,
  type McpServerDefinition,
  type Project,
  type Provider,
  getEffectiveModelAliases,
} from '@/config/types';
import { resolveProviderForModel } from '../../shared/provider-model-routing';
import { getAllMcpServersFromConfig } from '@/config/services/mcpService';
import { syncMcpServerNames } from '@/components/tools/toolBadgeConfig';
import {
  getAllMcpServers,
  getEnabledMcpServerIds,
  isImageUnderstandingSelectionAvailable,
  isProviderAvailable,
  resolveProvider,
} from '@/config/configService';
import {
  patchAgentConfig,
  patchAgentProjectConfig,
  getAgentById,
} from '@/config/services/agentConfigService';
import { BrowserPanelContext } from '@/context/BrowserPanelContext';
import { BROWSER_BLANK_URL } from '@/components/browserConstants';
import { CUSTOM_EVENTS, isPendingSessionId } from '../../shared/constants';
import {
  applyBuiltinBrowserExecutionToolToggle,
  MANAGED_BROWSER_MCP_ID,
} from '../../shared/browserTools';
import {
  IMAGE_UNDERSTANDING_TOOL_ID,
  OFFICIAL_TOOLS,
  normalizeOfficialToolIds,
  type OfficialToolId,
} from '../../shared/official-tools';
import { isSupportedLocale } from '../../shared/i18n';
import { workspacePathsEqual } from '../../shared/workspacePath';
import {
  autoModelKey,
  isAutoRoutingEnabled,
  normalizeModelMode,
  parseAutoRoutingSettings,
  type AutoRouteRecord,
} from '../../shared/autoRoute';
import {
  AutoRouteTagContext,
  type AutoRouteTagActions,
} from '@/components/AutoRouteTag';
import type { MainWindowPresentation } from '@/utils/mainWindowPresentation';
import {
  coerceReasoningEffortForRuntime,
  reasoningEffortChoices,
  reasoningEffortAfterModelChange,
} from '../../shared/reasoningEffort';
import {
  createConcreteProviderRoute,
  hasProviderRouteCredential,
  isConcreteProviderRoute,
} from '../../shared/providerRoute';
import type { ProviderRoute } from '../../shared/providerRoute';
import {
  isRuntimeBackedProvider,
  managedCodexRuntimePermissionToProviderPermission,
  projectManagedCodexPermissionToRuntime,
  runtimeBackedProviderPermissionMode,
  toProviderExecutionIntent,
  type RuntimeBackedProviderIdentity,
  type ProviderExecutionIntent,
} from '../../shared/providerExecution';
import type { SessionOrigin } from '../../shared/session-origin';
import type { CapabilityInitialSelect } from '../../shared/skillsTypes';
import {
  CC_MODELS,
  CC_PERMISSION_MODES,
  CODEX_PERMISSION_MODES,
  coerceModelForRuntime,
  DSH_PERMISSION_MODES,
  getDefaultRuntimePermissionMode,
  projectPermissionModeForRuntime,
  resolveEffectiveRuntime,
  runtimeSourceForRuntimeType,
  runtimeSupportsPrewarm,
} from '../../shared/types/runtime';
import type {
  RuntimeType,
  RuntimeDetections,
  RuntimeConfig,
  RuntimeDiagnostics,
  RuntimeExtensionDiagnostics,
} from '../../shared/types/runtime';
import type {
  FilePreviewIntent,
  InitialMessage,
  LaunchSessionBirthHint,
  SidecarConfigDisposition,
} from '@/types/tab';
import type { FilePreviewTarget } from '@/types/filePreview';
import { filePreviewErrorMessage, type LoadedFilePreview, type ResolvedFilePreview } from '@/utils/filePreview';
import { useChatFilePreviewNavigation } from './useChatFilePreviewNavigation';
import { shouldAutoSendInitialMessage } from '@/utils/initialMessageAutoSend';
import {
  canResumeProviderHistoryForSwitch,
  toProviderHistoryEnv,
  resolveBuiltinPermissionMode,
  resolveCurrentProviderForSession,
  resolveLegacyBuiltinSnapshotProviderId,
  isPinnedProviderUnavailable,
  shouldResetModelOnProviderChange,
  shouldSkipSnapshotWrite,
} from '@/utils/optionResolve';
import {
  buildProviderSwitchSessionBirth,
  resolveProviderSwitchIntegratedRuntime,
} from '@/utils/providerSwitchSessionBirth';
import {
  projectInputChromeRuntime,
  projectRuntimeExtensionUpdateNotice,
  shouldShowBuiltinSdkSlashCommands,
  shouldUseExternalRuntimeInputControls,
  supportsRuntimeConversationBranches,
} from '@/utils/runtimeUiProjection';
import {
  isProviderModelCompatibleWithRuntime,
  projectProvidersForRuntime,
} from '@/utils/runtimeProviderProjection';
import {
  createWorkspacePanelDisclosureState,
  DEFAULT_WORKSPACE_LAYOUT_METRICS,
  nextSplitViewAfterBrowserClose,
  reduceWorkspacePanelDisclosure,
  readWorkspacePanelPreference,
  rememberWorkspacePanelPreference,
  resolveWorkspacePanelMode,
  shouldPresentBrowserFullscreen,
} from '@/utils/chatWorkspaceLayout';
import {
  isManagedProviderSessionSnapshot,
  managedProviderSnapshotModel,
  managedProviderSnapshotProviderId,
  shouldSessionSnapshotUseProviderPicker,
} from '@/utils/sessionSnapshotProviderProjection';
import { coerceRuntimeBirthPermissionMode } from '../../shared/runtimeBirthFields';
// CronTaskConfig type is used via useCronTask hook

import {
  getRichDocKind,
  isPreviewable,
} from '../../shared/fileTypes';

const DESKTOP_SESSION_FORK_ORIGIN: SessionOrigin = {
  kind: 'desktop',
  surface: 'session_fork',
};
const WORKSPACE_PANEL_TRANSITION_MS = 200;

type ExtensionUpdateResponse = {
  success?: boolean;
  error?: string;
  extensionStatus?: RuntimeExtensionDiagnostics;
};

type SessionConfigPushKind = 'mcp' | 'agents';

type SplitPreviewFile = LoadedFilePreview;

type SwitchDialogCopy = {
  title: string;
  message: string;
  confirmText: string;
};

type WorkspaceLayoutMetrics = {
  viewportWidthPx: number;
  contentMinWidthPx: number;
  sidebarMinWidthPx: number;
};

function readRootPixelToken(tokenName: string, fallback: number): number {
  if (typeof document === 'undefined') return fallback;
  const value = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(tokenName),
  );
  return Number.isFinite(value) ? value : fallback;
}

function readWorkspaceLayoutMetrics(): WorkspaceLayoutMetrics {
  return {
    viewportWidthPx:
      typeof window === 'undefined'
        ? Number.POSITIVE_INFINITY
        : window.innerWidth,
    contentMinWidthPx: readRootPixelToken(
      '--breakpoint-mobile',
      DEFAULT_WORKSPACE_LAYOUT_METRICS.contentMinWidthPx,
    ),
    sidebarMinWidthPx: readRootPixelToken(
      '--sidebar-min-width',
      DEFAULT_WORKSPACE_LAYOUT_METRICS.sidebarMinWidthPx,
    ),
  };
}

function shouldShowWorkspaceByDefault(workspacePath: string): boolean {
