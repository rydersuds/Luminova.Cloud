import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";
import type { IncomingMessage } from "node:http";
import { fileURLToPath } from "node:url";

// Resolve the installed, patched package, not a copied implementation.
const proxyEntry = import.meta.resolve("http-proxy-middleware");
const { matchPathFilter } = await import(new URL("./path-filter.js", proxyEntry).href) as {
  matchPathFilter: (
    filter: string | string[] | ((pathname: string, req: IncomingMessage) => boolean),
    uri: string,
    req: IncomingMessage,
  ) => boolean;
};
const req = {} as IncomingMessage;

test("proxy filters preserve plain paths, globs, braces, extglobs and query handling", () => {
  const cases: Array<[string | string[], string, boolean]> = [
    ["/api", "/api/users?active=true", true],
    ["/api", "/other", false],
    [["/api", "/ajax"], "/ajax/users", true],
    ["/api/**", "/api/users/123?active=true", true],
    ["/api/*", "/api/users/123", false],
    ["/{api,ajax}/**", "/ajax/users", true],
    ["/api/@(users|teams)/**", "/api/teams/123", true],
    ["/api/@(users|teams)/**", "/api/projects/123", false],
    [["/api/**", "!**/*.html"], "/api/index.html", false],
    [["/api/**", "!**/*.html"], "/api/users", true],
    [["/api/**", "!**/*.html"], "/other/users", false],
    [["!**/*.html"], "/api/users", true],
    [["!**/*.html", "!**/*.css"], "/api/style.css", false],
    [["!**/*.html", "/api/**"], "/api/index.html", true],
    [["/api/**", "!/api/private/**", "/api/private/public/**"], "/api/private/public/data", true],
    [["/api/**", "!/api/private/**", "/api/private/public/**"], "/api/private/data", false],
    ["!(/api/**)", "/other", true],
    ["!(/api/**)", "/api/users", false],
  ];
  for (const [filter, uri, expected] of cases) {
    assert.equal(matchPathFilter(filter, uri, req), expected, `${JSON.stringify(filter)}: ${uri}`);
  }
  let receivedRequest: IncomingMessage | undefined;
  assert.equal(matchPathFilter((pathname, request) => {
    receivedRequest = request;
    return pathname === "/__clerk/v1/client";
  }, "/__clerk/v1/client?value=1", req), true);
  assert.equal(receivedRequest, req);
  assert.throws(() => matchPathFilter(["/api", "/ajax/**"], "/api/users", req));
});

test("Express's installed proxy-addr rejects spoofing through short IPv6 trust prefixes", () => {
  const require = createRequire(import.meta.resolve("express"));
  const proxyaddr = require("proxy-addr") as {
    compile: (subnet: string) => (address: string) => boolean;
  };
  assert.equal(proxyaddr.compile("::ffff:10.0.0.0/8")("203.0.113.5"), false);
  assert.equal(proxyaddr.compile("::/1")("203.0.113.5"), false);
  assert.equal(proxyaddr.compile("::ffff:10.0.0.0/104")("10.1.2.3"), true);
  assert.equal(proxyaddr.compile("10.0.0.0/8")("10.1.2.3"), true);
});

test("Mammoth CLI remains compatible with the sprintf-free argument parser", () => {
  const cli = fileURLToPath(new URL("../bin/mammoth", import.meta.resolve("mammoth")));
  const help = execFileSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  assert.match(help, /docx-path/);
  assert.match(help, /--output-format/);
  assert.match(help, /--output-dir/);
});
