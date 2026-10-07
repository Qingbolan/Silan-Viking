# AI application boundary

- `configuration.rs` owns device settings, profile validation and capability
  selection. Settings are reread when constructing a configured use case. An
  explicitly disabled capability remains unavailable; documented standalone
  provider constructors retain their existing contracts.
- `client.rs` owns the configured Chat Completions wire contract and connection
  checks. Domain-specific translation/review/image/speech payloads remain in
  their application use cases.
- `transport.rs` owns `AiClientFactory`, a closed typed set of transport policies.
  Each policy lazily initializes one connection pool. Pools contain no profile,
  endpoint, model, Authorization header or credential reference. Every request
  binds these from its invocation's existing snapshot.

The public `ai_engine` module exports remain unchanged. Existing timeout values
and redirect policies are preserved, including zero redirects for configured
endpoints and media operations. Credential storage remains outside this module.
Local HTTP tests verify two sequential requests use one accepted connection,
Authorization is not carried into a later unauthenticated request, and configured
requests never follow redirects. No external provider calls are used in tests.
