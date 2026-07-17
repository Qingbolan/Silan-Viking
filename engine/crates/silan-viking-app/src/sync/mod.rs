//! The sync layer — `Mapper` / `RowSet` / `Sink` and the sync orchestration.
//!
//! Per `docs/silan-viking/01` §1.8, this layer turns parsed Items into
//! `portfolio.db`:
//!
//! ```text
//!   Parsed --Mapper--> RowSet --Sink--> portfolio.db
//! ```
//!
//! - [`Mapper`] / [`MapperRegistry`] — the 6 closed mapping strategies.
//! - [`RowSet`] / [`RowSetBatch`] — the database-shaped product, pure data.
//! - [`Sink`] / [`SqliteSink`] — the only database-IO surface.
//! - [`run_sync`] / [`run_incremental_sync`] — the orchestration driving the
//!   scan → parse → validate → map → write chain (milestone M6).

mod error;
mod mapper;
mod rows;
mod run;
mod sink;

pub use error::{MapError, SyncError};
pub use mapper::{Mapper, MapperRegistry};
pub use rows::{Row, RowSet, RowSetBatch, SqlValue};
pub(crate) use run::source_revision;
pub use run::{run_incremental_sync, run_sync, SyncReport};
pub use sink::{Sink, SqliteSink};
