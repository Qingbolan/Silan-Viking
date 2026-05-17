//! `silan-viking-base` —— L1 纯工具层。
//!
//! 这是四层架构(见 `docs/silan-viking/01-oop结构.md` §1.1)的最底层:
//! 它**不知道** blog / idea / project 是什么,搬到任何别的项目仍然可用。
//! 它提供两类东西:
//!
//! - **值对象**:`SilanUri` / `Slug` / `Lang` / `ContentHash` / `Meta` /
//!   `ItemId` / `PartId` —— 不可变、自校验、无领域知识。
//! - **能力 trait**:`Identified` / `HasMeta` —— L2 `content` 的类型 `impl`
//!   它们,这就是设计文档说的「content 继承 base」在 Rust 里的落地机制
//!   (§1.2)。
//!
//! 它**不是** 什么:不解析文件、不碰数据库、不做 IO、不含校验业务规则
//! (校验是行为,属于 L3 `Parser`)。
//!
//! 错误统一为 `BaseError`(`thiserror` 派生,见 `09` §9.1)。本 crate 的
//! 非测试代码零 `unwrap()` / `expect()`。

mod error;
mod hash;
mod ids;
mod lang;
mod meta;
mod slug;
mod traits;
mod uri;

pub use error::BaseError;
pub use hash::ContentHash;
pub use ids::{ItemId, PartId};
pub use lang::Lang;
pub use meta::Meta;
pub use slug::Slug;
pub use traits::{HasMeta, Identified};
pub use uri::{Namespace, SilanUri};
