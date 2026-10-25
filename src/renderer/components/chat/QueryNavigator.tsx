// Query Navigator — left-side rail, expanded on hover or keyboard focus.
// The original scroll owner and virtualized navigation remain unchanged.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from '../../types/chat';
import { parseLeadingSystemReminder } from '../../../shared/systemReminder';

/** Minimum user queries to show the navigator */
const MIN_QUERIES = 3;

interface QueryNavigatorProps {
  messages: readonly Message[];
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  pauseAutoScroll: () => void;
  /** Virtuoso-aware navigation: scrolls to message by ID even if virtualized (not in DOM) */
  onNavigateToQuery?: (messageId: string) => void;
}

/** Extract plain text preview from message content */
function getQueryText(msg: Message): string {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    const textBlock = msg.content.find(
      (b): b is { type: 'text'; text: string } => b.type === 'text',
    );
    return textBlock?.text ?? '';
  }
  return '';
}

/** Extract the real user query from a mixed system-reminder + user message. */
function getVisibleQueryText(text: string): string {
  const trimmed = text.trim();
  const reminder = parseLeadingSystemReminder(trimmed);
  if (reminder.hasReminder) return reminder.visibleText;
  return text;
}

/** Match Message.tsx's non-bubble system render paths. */
function isNonUserQueryMessage(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith('<local-command-stdout>') ||
    getVisibleQueryText(trimmed).trim() === ''
  );
}

export default function QueryNavigator({
  messages,
  scrollContainerRef,
  pauseAutoScroll,
  onNavigateToQuery,
}: QueryNavigatorProps) {
  const { t } = useTranslation('chat');
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeIndexRaw, setActiveIndex] = useState(-1);
  const panelRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  // Extract real user queries (filter out system injections)
  const queries = useMemo(() => {
    return messages
      .flatMap((msg) => {
        if (msg.role !== 'user') return [];
        const text = getVisibleQueryText(getQueryText(msg));
        if (text.trim() === '' || isNonUserQueryMessage(text)) return [];
        return [{ id: msg.id, text }];
      });
  }, [messages]);

  // Clamp activeIndex to valid range (handles session switch, query list shrink)
  const activeIndex = activeIndexRaw >= 0 && activeIndexRaw < queries.length ? activeIndexRaw : -1;

  // Track active query via IntersectionObserver.
  // With virtualization, elements mount/unmount as the user scrolls. A MutationObserver
  // watches for child changes in the container and re-observes any new user message elements.
  const visibleIndicesRef = useRef(new Set<number>());

  useEffect(() => {
    visibleIndicesRef.current.clear();

    if (queries.length < MIN_QUERIES) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const idToQueryIndex = new Map<string, number>();
    queries.forEach((q, i) => idToQueryIndex.set(q.id, i));

    const observedElements = new WeakSet<Element>();
    const visibleSet = visibleIndicesRef.current;

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const messageId = el.getAttribute('data-message-id');
          if (!messageId) continue;
          const qIndex = idToQueryIndex.get(messageId);
          if (qIndex === undefined) continue;

          if (entry.isIntersecting) {
            visibleSet.add(qIndex);
          } else {
            visibleSet.delete(qIndex);
          }
        }

        if (visibleSet.size > 0) {
          setActiveIndex(Math.min(...visibleSet));
        }
      },
      {
        root: container,
        rootMargin: '0px 0px -60% 0px',
        threshold: 0,
      },
    );

    // Observe all currently-visible user elements
    const observeUserElements = () => {
      const userElements = container.querySelectorAll<HTMLElement>('[data-role="user"]');
      userElements.forEach((el) => {
        if (!observedElements.has(el)) {
          observedElements.add(el);
          intersectionObserver.observe(el);
        }
      });
    };

    observeUserElements();

    // Re-observe when virtuoso mounts/unmounts elements (DOM subtree changes).
    // Debounce: streaming causes 100+ mutations/sec (token appends, markdown renders).
    // Batch into a single querySelectorAll scan per 100ms window.
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const mutationObserver = new MutationObserver(() => {
      if (debounceTimer) return; // Already scheduled
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        observeUserElements();
      }, 100);
    });
    mutationObserver.observe(container, { childList: true, subtree: true });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      intersectionObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [queries, scrollContainerRef]);

  // Auto-scroll the panel to keep active item visible
  useEffect(() => {
    if (isExpanded && activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [isExpanded, activeIndex]);

  // Navigate to a query — prefer virtuoso-aware navigation (handles virtualized messages)
  const handleQueryClick = useCallback(
    (queryId: string) => {
      // Virtuoso path: scroll by index even if the message is not in the DOM
      if (onNavigateToQuery) {
        onNavigateToQuery(queryId);
        return;
      }

      // Fallback: direct DOM scroll (for non-virtualized contexts)
      const container = scrollContainerRef.current;
      if (!container) return;

      const target = container.querySelector<HTMLElement>(
        `[data-message-id="${CSS.escape(queryId)}"]`,
      );
      if (!target) return;

      pauseAutoScroll();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [scrollContainerRef, pauseAutoScroll, onNavigateToQuery],
  );

  if (queries.length < MIN_QUERIES) return null;

  return (
    <div
      className="absolute left-2 top-3 bottom-3 z-30 hidden md:flex items-center pointer-events-none"
    >
      {/* Dashes stay anchored left while labels expand toward the conversation. */}
      <div
        ref={panelRef}
        role="navigation"
        aria-label={t('queryNavigator.label')}
        tabIndex={0}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => {
          if (!panelRef.current?.contains(document.activeElement)) setIsExpanded(false);
        }}
        onFocus={() => setIsExpanded(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setIsExpanded(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && isExpanded) {
            event.stopPropagation();
            event.currentTarget.focus();
            setIsExpanded(false);
          }
        }}
        className={`pointer-events-auto relative flex max-h-[60%] flex-col overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-[width,background-color,border-color,box-shadow] duration-200 motion-reduce:transition-none ${
          isExpanded
            ? 'w-72 rounded-xl border border-[var(--line)] shadow-lg'
            : 'w-5 border border-transparent'
        }`}
        style={isExpanded ? {
          background: 'var(--paper-elevated)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        } : undefined}
      >
        {/* Top fade mask */}
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-5 transition-opacity duration-200 ${
            isExpanded ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ background: 'linear-gradient(to bottom, var(--paper-elevated), var(--paper-elevated-a0))' }}
        />

        {/* Native scrolling remains available without a second visible scrollbar. */}
        <div
          aria-hidden={!isExpanded}
          className="chat-scroll-surface min-h-0 overflow-y-auto overscroll-contain py-3"
        >
          {queries.map((q, i) => {
            const isActive = i === activeIndex;
            return (
              <button
                key={q.id}
                ref={isActive ? activeItemRef : undefined}
                type="button"
                title={q.text}
                aria-current={isActive ? 'location' : undefined}
                tabIndex={isExpanded ? 0 : -1}
                onClick={() => isExpanded && handleQueryClick(q.id)}
                className={`flex w-full flex-shrink-0 items-center gap-2 py-[5px] text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)] ${
                  isExpanded
                    ? `pl-1.5 pr-3 cursor-pointer rounded-lg ${isActive ? 'bg-[var(--hover-bg)]' : 'hover:bg-[var(--hover-bg)]'}`
                    : 'pl-1.5 cursor-default'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex-shrink-0 rounded-full transition-all duration-150 ${
                    isActive
                      ? 'w-[10px] h-[3px] bg-[var(--accent)]'
                      : `w-[8px] h-[2px] bg-[var(--ink-faint)] ${isExpanded ? '' : 'opacity-40'}`
                  }`}
                />
                {/* Query text — only visible when expanded */}
                <span
                  className={`flex-1 truncate text-sm leading-6 transition-opacity duration-200 ${
                    isExpanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'
                  } ${isActive ? 'text-[var(--accent)] font-medium' : 'text-[var(--ink-muted)]'}`}
                >
                  {q.text}
                </span>

              </button>
            );
          })}
        </div>

        {/* Bottom fade mask */}
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 h-5 transition-opacity duration-200 ${
            isExpanded ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ background: 'linear-gradient(to top, var(--paper-elevated), var(--paper-elevated-a0))' }}
        />
      </div>
    </div>
  );
}
