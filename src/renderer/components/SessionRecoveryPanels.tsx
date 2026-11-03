import type { ComponentProps, ReactNode } from 'react';
import { SessionContinuationBanner } from './SessionContinuationBanner';
import { RecoveryActionReview } from './RecoveryActionReview';

/** One Session's recovery controls, with independent component identities. */
export function SessionRecoveryPanels({ continuation, review, children }: {
  continuation: ComponentProps<typeof SessionContinuationBanner>;
  review?: ComponentProps<typeof RecoveryActionReview>;
  children?: ReactNode;
}) {
  return <>
    {children}
    {review ? <RecoveryActionReview key={`review:${review.sessionId}`} {...review}
      interrupted={!!continuation.turnId && !continuation.hidden}
      continuation={<SessionContinuationBanner key={`continuation:${continuation.sessionId}`} {...continuation} compact />} />
      : <SessionContinuationBanner key={`continuation:${continuation.sessionId}`} {...continuation} />}
  </>;
}
