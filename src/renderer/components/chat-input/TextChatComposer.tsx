import { useRef, useState, type ReactNode, type RefObject } from "react";
import { useChatComposerKeydown } from "@/hooks/useChatComposerKeydown";
import {
  ComposerSurface,
  ComposerTextarea,
  ComposerToolbar,
  ComposerSendButton,
  useComposerAutoSize,
} from "./ComposerSurface";

/** Text-only capability set; no file service, Provider, tool or local Session owner. */
export function TextChatComposer({
  id,
  value,
  onChange,
  onSend,
  disabled,
  label,
  placeholder,
  sendLabel,
  status,
  inputRef,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  label: string;
  placeholder: string;
  sendLabel: string;
  status?: ReactNode;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? internalRef;
  const composing = useRef(false);
  const [resizeBump, setResizeBump] = useState(0);
  const handlers = useChatComposerKeydown(() => {
    if (!disabled && value.trim()) onSend();
  });
  useComposerAutoSize(ref, value, 2, resizeBump, composing);
  return (
    <ComposerSurface>
      <div className="px-4 pt-3 pb-1">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)]">
          <ComposerTextarea
            id={id}
            ref={ref}
            value={value}
            maxLength={8000}
            disabled={disabled}
            aria-label={label}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handlers.onKeyDown}
            onCompositionStart={() => {
              composing.current = true;
              handlers.onCompositionStart();
            }}
            onCompositionEnd={() => {
              composing.current = false;
              handlers.onCompositionEnd();
              setResizeBump((n) => n + 1);
            }}
          />
        </div>
      </div>
      <ComposerToolbar>
        <div
          className="min-w-0 flex-1 truncate text-xs text-[var(--ink-muted)]"
          title={typeof status === "string" ? status : undefined}
        >
          {status}
        </div>
        <ComposerSendButton
          onClick={onSend}
          disabled={disabled || !value.trim()}
          aria-label={sendLabel}
          title={sendLabel}
        />
      </ComposerToolbar>
    </ComposerSurface>
  );
}
