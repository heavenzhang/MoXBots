import {
  forwardRef,
  useEffect,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type RefObject,
  type TextareaHTMLAttributes,
} from "react";
import { SendIcon } from "@/components/icons";
import { LINE_HEIGHT, MAX_LINES } from "./constants";

/** Shared rendered composer. Session transports supply actions, never runtime configuration. */
export function ComposerSurface({
  joined = false,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { joined?: boolean }) {
  return (
    <div
      {...props}
      data-composer-surface
      className={`relative min-w-0 border border-[var(--line)] bg-[var(--paper-elevated)] shadow-md ${joined ? "rounded-b-2xl rounded-t-none border-t-0" : "rounded-2xl"} ${className}`}
    />
  );
}
export function ComposerToolbar(props: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`toolbar-menus flex min-w-0 flex-nowrap items-center px-3 pb-2 pt-1 ${props.className ?? ""}`}
      style={{ containerType: "inline-size", ...props.style }}
    />
  );
}
export const ComposerTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function ComposerTextarea(
  { rows = 2, className = "", style, ...props },
  ref,
) {
  return (
    <textarea
      {...props}
      ref={ref}
      rows={rows}
      wrap="soft"
      className={`col-start-1 row-start-1 block min-w-0 w-full resize-none bg-transparent text-base leading-relaxed text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)] ${className}`}
      style={{
        minHeight: LINE_HEIGHT * rows,
        maxHeight: LINE_HEIGHT * MAX_LINES,
        overflowX: "hidden",
        overflowY: "auto",
        overflowWrap: "anywhere",
        transitionProperty: "height, min-height",
        transitionDuration: "220ms",
        transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
        willChange: "height",
        ...style,
      }}
    />
  );
});
export function ComposerSendButton({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`shrink-0 rounded-lg bg-[var(--button-primary-bg)] p-2 text-[var(--button-primary-text)] transition-colors hover:bg-[var(--button-primary-bg-hover)] disabled:bg-[var(--ink-muted)]/15 disabled:text-[var(--ink-muted)]/60 ${className}`}
    >
      <SendIcon aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
/** Both composers preserve IME marked text and hidden-tab geometry during resize. */
export function useComposerAutoSize(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
  minLines: number,
  resizeBump: number,
  composingRef: RefObject<boolean>,
) {
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || composingRef.current || textarea.offsetParent === null)
      return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(LINE_HEIGHT * minLines, Math.min(textarea.scrollHeight, LINE_HEIGHT * MAX_LINES))}px`;
  }, [textareaRef, composingRef, value, minLines, resizeBump]);
}
