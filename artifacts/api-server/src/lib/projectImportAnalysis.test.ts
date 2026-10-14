import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyProjectImportAnalysisError,
  createProjectImportAiClient,
  projectImportAnalysisFailureMessage,
  ProjectImportAiConfigurationError,
} from "./projectImportAnalysis";

test("project import AI client requires a valid configured endpoint and credential", () => {
  assert.throws(
    () => createProjectImportAiClient({}),
    (error: unknown) =>
      error instanceof ProjectImportAiConfigurationError &&
      error.configurationIssue === "missing_base_url",
  );
  assert.throws(
    () => createProjectImportAiClient({ AI_INTEGRATIONS_OPENAI_BASE_URL: "not a URL", AI_INTEGRATIONS_OPENAI_API_KEY: "fixture" }),
    (error: unknown) =>
      error instanceof ProjectImportAiConfigurationError &&
      error.configurationIssue === "invalid_base_url",
  );
  assert.throws(
    () => createProjectImportAiClient({ AI_INTEGRATIONS_OPENAI_BASE_URL: "https://example.test/v1" }),
    (error: unknown) =>
      error instanceof ProjectImportAiConfigurationError &&
      error.configurationIssue === "missing_api_key",
  );
});

test("repeated upstream 503 responses are classified as temporary and retain safe diagnostics", () => {
  const details = classifyProjectImportAnalysisError({
    status: 503,
    code: "upstream_overloaded",
    type: "server_error",
    message: "Provider response contained private document text and must not be logged.",
  });

  assert.deepEqual(details, {
    category: "temporary_provider",
    retryable: true,
    status: 503,
    providerCode: "upstream_overloaded",
    providerType: "server_error",
  });
  assert.match(projectImportAnalysisFailureMessage(details), /temporarily unavailable.*HTTP 503/i);
  assert.doesNotMatch(JSON.stringify(details), /private document text/i);
});

test("nested provider status and error fields normalize to the same safe category", () => {
  const details = classifyProjectImportAnalysisError({
    response: {
      status: 502,
      data: {
        error: {
          type: "server_error",
          code: "gateway_timeout",
          message: "Untrusted response details are excluded.",
        },
      },
    },
  });

  assert.equal(details.category, "temporary_provider");
  assert.equal(details.retryable, true);
  assert.equal(details.status, 502);
  assert.equal(details.providerType, "server_error");
  assert.equal(details.providerCode, "gateway_timeout");
  assert.doesNotMatch(JSON.stringify(details), /Untrusted response details/i);
});

test("provider authentication and endpoint failures are actionable, not file failures", () => {
  for (const status of [401, 402, 403, 404]) {
    const details = classifyProjectImportAnalysisError({ status });
    assert.equal(details.category, "provider_configuration");
    assert.equal(details.retryable, true);
    assert.match(projectImportAnalysisFailureMessage(details), /workspace administrator.*AI integration/i);
    assert.doesNotMatch(projectImportAnalysisFailureMessage(details), /choose different files/i);
  }
  const missingConfiguration = classifyProjectImportAnalysisError(
    new ProjectImportAiConfigurationError("missing_api_key"),
  );
  assert.equal(missingConfiguration.category, "provider_configuration");
  assert.equal(missingConfiguration.retryable, true);
  assert.equal(missingConfiguration.providerCode, "missing_api_key");

  const quota = classifyProjectImportAnalysisError({
    status: 429,
    code: "insufficient_quota",
    type: "rate_limit_error",
  });
  assert.equal(quota.category, "provider_configuration");
  assert.equal(quota.retryable, true);
});

test("permanent content rejections do not retry while network interruptions can", () => {
  const oversized = classifyProjectImportAnalysisError({ statusCode: 413 });
  assert.equal(oversized.category, "input_rejected");
  assert.equal(oversized.retryable, false);
  assert.equal(classifyProjectImportAnalysisError({ status: 400, code: "content_policy_violation" }).retryable, false);

  const connection = classifyProjectImportAnalysisError({
    name: "APIConnectionError",
    message: "Private request data is not included in diagnostics.",
  });
  assert.equal(connection.category, "temporary_provider");
  assert.equal(connection.retryable, true);
});
