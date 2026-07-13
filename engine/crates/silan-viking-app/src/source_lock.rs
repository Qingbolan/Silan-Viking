//! Process-local serialization for mutations of the authoritative content tree.

use std::sync::{Mutex, MutexGuard};

static CONTENT_WRITE_LOCK: Mutex<()> = Mutex::new(());

pub(crate) fn acquire() -> Result<MutexGuard<'static, ()>, String> {
    CONTENT_WRITE_LOCK
        .lock()
        .map_err(|error| format!("content write lock is poisoned: {error}"))
}
