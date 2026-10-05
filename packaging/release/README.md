# GitHub software releases

TideMark is the only build-version authority. `.tidemark.toml` uses annotated
`v*` release anchors; manifests retain their package compatibility versions.
Do not hand-edit package versions to create a release.

1. Run the engine and Desktop validation suites and commit all release source.
2. Create an annotated semantic-version tag (for example `v2.0.0`) using the
   repository's required author identity. Push the commit and tag to origin.
3. Verify `tide mark --explain` selects that tag and `scripts/tide-version.sh`
   returns its exact version.
4. On macOS run `packaging/release/package-macos.sh /tmp/silan-release-VERSION`.
   The destination must be empty and outside the repository. The script rejects
   dirty source and unannotated tags, builds the CLI and Desktop, checks their
   versions, and creates a native CLI binary, app ZIP, DMG and SHA256SUMS.
5. Create a draft GitHub Release for the existing tag, upload those assets, then
   publish after checking filenames and checksums. State the architecture and
   signing/notarization status explicitly. Never label native builds universal.

The CLI asset name intentionally matches `engine/install.sh`'s stable installer
contract. These local packages contain only the host architecture; other targets
must be built and verified on their respective hosts before being advertised.
