//! Keep exact writer-drop/reopen contracts independent of other libtest spawns.
//!
//! Tantivy's mmap writer lock is an owned OS file descriptor. A concurrent
//! process spawn in another test can briefly inherit it before exec, so an
//! immediate same-path reopen must run in its own exact-test process. The
//! original assertions still run once; no lock deletion or operation retry.

use std::process::{Child, Stdio};
use std::time::{Duration, Instant};

const EXACT_TEST_ENV: &str = "MOXBOTS_SEARCH_EXACT_TEST";

/// Return true in the parent after its one exact child passed; false in that
/// child so the caller executes its original test body unchanged.
pub(super) fn run_isolated(test_name: &str) -> bool {
    if std::env::var(EXACT_TEST_ENV).as_deref() == Ok(test_name) {
        return false;
    }

    struct OwnedChild(Child);
    impl Drop for OwnedChild {
        fn drop(&mut self) {
            if self.0.try_wait().ok().flatten().is_none() {
                let _ = self.0.kill();
                let _ = self.0.wait();
            }
        }
    }

    let mut child = OwnedChild(
        crate::process_cmd::new(std::env::current_exe().expect("current test executable"))
            .args(["--exact", test_name, "--nocapture", "--test-threads=1"])
            .env(EXACT_TEST_ENV, test_name)
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("spawn exact isolated search lifecycle test"),
    );
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        if let Some(status) = child.0.try_wait().expect("observe owned exact test child") {
            assert!(
                status.success(),
                "isolated search test {test_name} exited {status}"
            );
            return true;
        }
        assert!(
            Instant::now() < deadline,
            "isolated search test {test_name} deadline"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}
