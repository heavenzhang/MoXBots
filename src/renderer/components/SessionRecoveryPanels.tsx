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
    <SessionContinuationBanner key={`continuation:${continuation.sessionId}`} {...continuation} />
    {children}
    {review && <RecoveryActionReview key={`review:${review.sessionId}`} {...review} />}
  </>;
}
