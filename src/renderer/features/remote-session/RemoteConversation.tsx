import { useMemo, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import MessageList from "@/components/MessageList";
import { useChatScrollModel } from "@/hooks/useChatScrollModel";
import { useChatScrollController } from "@/hooks/useChatScrollController";
import { ConversationContentContext } from "@/context/ConversationContentContext";
import type { RemoteMessage } from "../../../shared/remoteSession";
import { presentRemoteTranscript } from "./transcriptPresentation";

/** The normal chat's rendered timeline and scroll owner, backed by remote observations. */
export function RemoteConversation({
  source,
  sessionKey,
  isActive,
  header,
  footer,
  hasOlder,
  olderDisabled,
  olderCount,
  onLoadOlder,
}: {
  source: readonly RemoteMessage[];
  sessionKey: string;
  isActive: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  hasOlder: boolean;
  olderDisabled: boolean;
  olderCount: number;
  onLoadOlder: (beforePrepend: () => void) => Promise<void>;
}) {
  const { t } = useTranslation("app");
  const rootRef = useRef<HTMLDivElement>(null);
  const messages = useMemo(
    () => presentRemoteTranscript(source, t("remoteSession.truncated")),
    [source, t],
  );
  const model = useChatScrollModel({
    historyMessages: messages,
    streamingMessage: null,
    firstItemIndex: 100000 - olderCount,
    sessionId: sessionKey,
  });
  const scroll = useChatScrollController({
    messages: model.data,
    isActive,
    sessionId: sessionKey,
    rootRef,
  });
  const loadOlder = async () => {
    // Explicit history navigation takes over from tail-follow before its async page arrives.
    scroll.pauseAutoScroll();
    await onLoadOlder(() => {
      const anchor = scroll.captureAnchor("prepend-older");
      if (anchor) scroll.preserveAnchorAfterPrepend(anchor);
    });
  };
  const headerContent = (
    <div className="space-y-3 py-3">
      {header}
      {hasOlder && (
        <button
          type="button"
          disabled={olderDisabled}
          onClick={() => void loadOlder()}
          className="rounded-lg px-3 py-2 text-sm text-[var(--ink-secondary)] hover:bg-[var(--hover-bg)] disabled:opacity-50"
        >
          {t("remoteSession.older")}
        </button>
      )}
    </div>
  );
  return (
    <ConversationContentContext.Provider value="remote">
      <div
        ref={rootRef}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        data-remote-conversation
      >
        <MessageList
          messages={model.data}
          streamingMessage={null}
          isLoading={false}
          sessionId={sessionKey}
          isActive={isActive}
          headerContent={headerContent}
          footerContent={<div className="space-y-3">{footer}</div>}
          virtuosoRef={scroll.virtuosoRef}
          onScrollerRef={scroll.attachScroller}
          followEnabledRef={scroll.followEnabledRef}
          scrollToBottom={scroll.scrollToBottom}
          handleAtBottomChange={scroll.handleAtBottomChange}
          onRowLayoutChanged={scroll.onRowLayoutChanged}
          onViewportAdmissionChanged={scroll.onViewportAdmissionChanged}
          onItemsRendered={scroll.onItemsRendered}
          isViewportRecoveryFenced={scroll.isViewportRecoveryFenced}
          composerPlacement="flow"
          firstItemIndex={model.firstItemIndex}
          heightEstimateSeed={model.heightEstimateSeed}
          layoutByMessageId={model.layoutByMessageId}
        />
      </div>
    </ConversationContentContext.Provider>
  );
}
