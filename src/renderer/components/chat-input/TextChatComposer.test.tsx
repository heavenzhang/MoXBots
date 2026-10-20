import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TextChatComposer } from "./TextChatComposer";
const mocks = vi.hoisted(() => ({ config: { chatSendShortcut: "modEnter" } }));
vi.mock("@/config/useConfigData", () => ({
  useConfigData: () => ({ config: mocks.config }),
}));
afterEach(cleanup);
it("shares the ordinary composer primitives and send preference without local file/runtime controls", () => {
  const onSend = vi.fn(),
    onChange = vi.fn();
  render(
    <TextChatComposer
      id="remote"
      value="draft"
      onSend={onSend}
      onChange={onChange}
      disabled={false}
      label="Message"
      placeholder="Message"
      sendLabel="Send"
    />,
  );
  expect(document.querySelector("[data-composer-surface]")).toBeTruthy();
  const input = screen.getByRole("textbox");
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onSend).not.toHaveBeenCalled();
  fireEvent.compositionStart(input);
  fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
  expect(onSend).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input);
  fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
  expect(onSend).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: "changed" } });
  expect(onChange).toHaveBeenCalledWith("changed");
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(document.querySelector('input[type="file"]')).toBeNull();
});
