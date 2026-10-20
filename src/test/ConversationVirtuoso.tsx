// Layout-free test stand-in. Browser acceptance runs the actual Virtuoso.
import React, { forwardRef, useImperativeHandle, type ReactNode } from "react";
import type { Message } from "@/types/chat";
interface Props {
  data: Message[];
  context: unknown;
  itemContent: (index: number, message: Message, context: unknown) => ReactNode;
  components?: {
    Header?: React.ComponentType<{ context: unknown }>;
    Footer?: React.ComponentType<{ context: unknown }>;
  };
}
export const Virtuoso = forwardRef(function TestConversationVirtuoso(
  { data, context, itemContent, components }: Props,
  ref,
) {
  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex() {},
      scrollTo() {},
      scrollBy() {},
      getState(callback: (state: unknown) => void) {
        callback({});
      },
    }),
    [],
  );
  const Header = components?.Header,
    Footer = components?.Footer;
  return (
    <div data-testid="conversation-timeline">
      {Header && <Header context={context} />}
      {data.map((message, index) => (
        <React.Fragment key={message.id}>
          {itemContent(index, message, context)}
        </React.Fragment>
      ))}
      {Footer && <Footer context={context} />}
    </div>
  );
});
