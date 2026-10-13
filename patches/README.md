# Dependency security patches

## http-proxy-middleware 4.2.0

The latest release still depends on micromatch, which brings in braces 3.0.3.
There is no patched braces release for GHSA-vfj7-8cjw-p6xm.

The patch replaces the proxy's single-path micromatch call with picomatch (the
matcher micromatch itself uses), preserving ordered positive/negative glob
filters. It leaves proxy transport, headers, lifecycle hooks and custom path
callbacks unchanged. Workspace package extensions supply picomatch, and a
version-scoped override removes the unused micromatch dependency.

Keep the patch, extension and removal override paired. When upgrading the
proxy, check whether upstream has removed or fixed the vulnerable dependency
before removing this workaround. Regression tests run in the API server's
normal test suite and exercise the actual installed patch.

## Other resolution constraints

- Brace expansion stays on each parent's existing major version, with all
  three reported denial-of-service fixes included.
- The API generator stays at its existing resolved release; compatible
  markdown-it and fast-uri patches avoid unrelated generated-code changes.
- Mammoth's scoped argparse 2 override removes sprintf-js, which has no safe
  published version. Document extraction and CLI help are tested.
- Tailwind typography pins selector-parser 6, whose fix is only available in
  7.1.6. The override is verified by the frontend production build.
- The preview uses tinyglobby instead of fast-glob to remove the other
  micromatch/braces dependency path. Discovery tests cover nested, private,
  removed and absent components.
