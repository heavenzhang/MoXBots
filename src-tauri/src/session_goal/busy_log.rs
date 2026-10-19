//! Aggregated observability for Goal continuation backpressure.
//!
//! While a Session is busy the Scheduler probes every five seconds. Logging
//! every probe turns normal waiting into an apparent execution-error stream,
//! so only the first deferral, a periodic summary, and the recovery are
//! logged. Failure accounting stays in the Scheduler.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::ulog_info;

pub(crate) const SUMMARY_INTERVAL: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DeferredLog {
    First,
    Summary { probes: u64, waited: Duration },
    Silent,
}

#[derive(Debug)]
struct Streak {
    session_id: String,
    started: Instant,
    probes: u64,
    last_log: Instant,
}

#[derive(Debug, Default)]
pub(crate) struct BusyLogTracker {
    streaks: HashMap<String, Streak>,
}

impl BusyLogTracker {
    pub(crate) fn deferred(
        &mut self,
        goal_id: &str,
        session_id: &str,
        now: Instant,
    ) -> DeferredLog {
        if let Some(streak) = self.streaks.get_mut(goal_id) {
            streak.probes += 1;
            if now.saturating_duration_since(streak.last_log) >= SUMMARY_INTERVAL {
                streak.last_log = now;
                return DeferredLog::Summary {
                    probes: streak.probes,
                    waited: now.saturating_duration_since(streak.started),
                };
            }
            return DeferredLog::Silent;
        }
        self.streaks.insert(
            goal_id.to_string(),
            Streak {
                session_id: session_id.to_string(),
                started: now,
                probes: 1,
                last_log: now,
            },
        );
        DeferredLog::First
    }

    /// Return the completed streak and forget it, so a later busy period logs
    /// its own first deferral.
    pub(crate) fn resumed(
        &mut self,
        goal_id: &str,
        now: Instant,
    ) -> Option<(String, u64, Duration)> {
        let streak = self.streaks.remove(goal_id)?;
        Some((
            streak.session_id,
            streak.probes,
            now.saturating_duration_since(streak.started),
        ))
    }

    #[cfg(test)]
    pub(crate) fn probe_count(&self, goal_id: &str) -> u64 {
        self.streaks.get(goal_id).map_or(0, |streak| streak.probes)
    }
}

static TRACKER: OnceLock<Mutex<BusyLogTracker>> = OnceLock::new();

fn tracker() -> &'static Mutex<BusyLogTracker> {
    TRACKER.get_or_init(|| Mutex::new(BusyLogTracker::default()))
}

pub(crate) fn note_deferred(goal_id: &str, session_id: &str) {
    let decision = tracker()
        .lock()
        .map(|mut tracker| tracker.deferred(goal_id, session_id, Instant::now()));
    match decision {
        Ok(DeferredLog::First) => ulog_info!(
            "[Goal] Continuation {} waiting: Session {} is busy; deferring without dispatching",
            goal_id,
            session_id
        ),
        Ok(DeferredLog::Summary { probes, waited }) => ulog_info!(
            "[Goal] Continuation {} still waiting after {}s ({} probes); Session {} is busy",
            goal_id,
            waited.as_secs(),
            probes,
            session_id
        ),
        Ok(DeferredLog::Silent) | Err(_) => {}
    }
}

pub(crate) fn note_resumed(goal_id: &str) {
    let streak = tracker()
        .lock()
        .ok()
        .and_then(|mut tracker| tracker.resumed(goal_id, Instant::now()));
    if let Some((session_id, probes, waited)) = streak {
        ulog_info!(
            "[Goal] Continuation {} resumed after {}s ({} deferred probes); Session {} is ready",
            goal_id,
            waited.as_secs(),
            probes,
            session_id
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rapid_deferrals_log_once_and_stay_counted() {
        let base = Instant::now();
        let mut tracker = BusyLogTracker::default();
        assert_eq!(
            tracker.deferred("goal-1", "session-1", base),
            DeferredLog::First
        );
        assert_eq!(
            tracker.deferred("goal-1", "session-1", base + Duration::from_secs(5)),
            DeferredLog::Silent
        );
        assert_eq!(
            tracker.deferred("goal-1", "session-1", base + Duration::from_secs(10)),
            DeferredLog::Silent
        );
        assert_eq!(tracker.probe_count("goal-1"), 3);
    }

    #[test]
    fn summary_is_emitted_at_the_interval_with_cumulative_counts() {
        let base = Instant::now();
        let mut tracker = BusyLogTracker::default();
        tracker.deferred("goal-1", "session-1", base);
        for step in 1..=11 {
            assert_eq!(
                tracker.deferred("goal-1", "session-1", base + Duration::from_secs(step * 5)),
                DeferredLog::Silent
            );
        }
        assert_eq!(
            tracker.deferred("goal-1", "session-1", base + Duration::from_secs(65)),
            DeferredLog::Summary {
                probes: 13,
                waited: Duration::from_secs(65),
            }
        );
        assert_eq!(
            tracker.deferred("goal-1", "session-1", base + Duration::from_secs(70)),
            DeferredLog::Silent
        );
    }

    #[test]
    fn resuming_reports_the_streak_and_resets_it() {
        let base = Instant::now();
        let mut tracker = BusyLogTracker::default();
        tracker.deferred("goal-1", "session-1", base);
        tracker.deferred("goal-1", "session-1", base + Duration::from_secs(5));
        assert_eq!(
            tracker.resumed("goal-1", base + Duration::from_secs(8)),
            Some(("session-1".to_string(), 2, Duration::from_secs(8)))
        );
        assert_eq!(
            tracker.resumed("goal-1", base + Duration::from_secs(9)),
            None
        );
        assert_eq!(
            tracker.deferred("goal-1", "session-1", base + Duration::from_secs(10)),
            DeferredLog::First
        );
    }

    #[test]
    fn busy_streaks_are_isolated_per_goal() {
        let base = Instant::now();
        let mut tracker = BusyLogTracker::default();
        assert_eq!(
            tracker.deferred("goal-1", "session-1", base),
            DeferredLog::First
        );
        assert_eq!(
            tracker.deferred("goal-2", "session-2", base),
            DeferredLog::First
        );
        assert_eq!(
            tracker.deferred("goal-1", "session-1", base + Duration::from_secs(5)),
            DeferredLog::Silent
        );
        assert_eq!(tracker.probe_count("goal-2"), 1);
    }
}
