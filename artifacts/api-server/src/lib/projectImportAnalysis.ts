import OpenAI from "openai";

export class ProjectImportAiConfigurationError extends Error {
  readonly configurationIssue: "missing_base_url" | "invalid_base_url" | "missing_api_key";

  constructor(configurationIssue: ProjectImportAiConfigurationError["configurationIssue"]) {
    super("Project import AI integration is not configured correctly.");
    this.name = "ProjectImportAiConfigurationError";
    this.configurationIssue = configurationIssue;
  }
}

type ProjectImportAiEnvironment = {
  AI_INTEGRATIONS_OPENAI_BASE_URL?: string;
  AI_INTEGRATIONS_OPENAI_API_KEY?: string;
};

export function createProjectImportAiClient(
  environment: ProjectImportAiEnvironment = process.env,
) {
  const baseURL = environment.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim();
  const apiKey = environment.AI_INTEGRATIONS_OPENAI_API_KEY?.trim();
  if (!baseURL) throw new ProjectImportAiConfigurationError("missing_base_url");
  if (!apiKey) throw new ProjectImportAiConfigurationError("missing_api_key");

  try {
    const endpoint = new URL(baseURL);
    if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
      throw new Error("Unsupported protocol");
    }
  } catch {
    throw new ProjectImportAiConfigurationError("invalid_base_url");
  }

  return new OpenAI({
    baseURL,
    apiKey,
    maxRetries: 2,
  });
}

type AnalysisErrorCategory = "temporary_provider" | "provider_configuration" | "input_rejected" | "invalid_analysis";

export type ProjectImportAnalysisErrorDetails = {
  category: AnalysisErrorCategory;
  retryable: boolean;
  status?: number;
  providerCode?: string;
  providerType?: string;
  errorName?: string;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" ? value as Record<string, unknown> : null;

const safeIdentifier = (value: unknown): string | undefined =>
  typeof value === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(value) ? value : undefined;

const readStatus = (error: unknown): number | undefined => {
  const record = asRecord(error);
  const nestedError = asRecord(record?.error);
  const response = asRecord(record?.response);
  const responseBody = asRecord(response?.data);
  const values = [
    record?.status,
    record?.statusCode,
    record?.httpStatus,
    response?.status,
    nestedError?.status,
    nestedError?.statusCode,
    responseBody?.status,
  ];
  return values.find((value): value is number =>
    typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599,
  );
};

const readProviderField = (error: unknown, key: "code" | "type") => {
  const record = asRecord(error);
  const nestedError = asRecord(record?.error);
  const response = asRecord(record?.response);
  const responseBody = asRecord(response?.data);
  const bodyError = asRecord(responseBody?.error);
  return safeIdentifier(record?.[key])
    ?? safeIdentifier(nestedError?.[key])
    ?? safeIdentifier(responseBody?.[key])
    ?? safeIdentifier(bodyError?.[key]);
};

const hasNetworkErrorCode = (error: unknown): boolean => {
  const record = asRecord(error);
  const cause = asRecord(record?.cause);
  const code = safeIdentifier(record?.code) ?? safeIdentifier(cause?.code);
  return code !== undefined && /^(?:ECONNRESET|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|ETIMEDOUT|EPIPE)$/i.test(code);
};

export function classifyProjectImportAnalysisError(error: unknown): ProjectImportAnalysisErrorDetails {
  const record = asRecord(error);
  const status = readStatus(error);
  const providerCode = readProviderField(error, "code");
  const providerType = readProviderField(error, "type");
  const errorName = safeIdentifier(record?.name);
  const code = providerCode?.toLowerCase();
  const codeIsConfigurationFailure = /(?:api_key|model_not_found|unsupported|invalid_request|unauthorized|forbidden|authentication|insufficient_quota|billing|quota)/i.test(code ?? "");
  const codeIsInputFailure = /(?:context_length|content_filter|content_policy|invalid_input|safety|policy|unprocessable|payload_too_large)/i.test(code ?? "");

  if (error instanceof ProjectImportAiConfigurationError) {
    return { category: "provider_configuration", retryable: true, providerCode: error.configurationIssue, errorName };
  }
  if (codeIsConfigurationFailure) {
    return {
      category: "provider_configuration",
      retryable: true,
      ...(status === undefined ? {} : { status }),
      ...(providerCode ? { providerCode } : {}),
      ...(providerType ? { providerType } : {}),
      ...(errorName ? { errorName } : {}),
    };
  }
  if (
    status === 408 || status === 409 || status === 425 || status === 429 || (status !== undefined && status >= 500) ||
    errorName === "APIConnectionError" || errorName === "APIConnectionTimeoutError" ||
    errorName === "TimeoutError" || errorName === "AbortError" || hasNetworkErrorCode(error)
  ) {
    return {
      category: "temporary_provider",
      retryable: true,
      ...(status === undefined ? {} : { status }),
      ...(providerCode ? { providerCode } : {}),
      ...(providerType ? { providerType } : {}),
      ...(errorName ? { errorName } : {}),
    };
  }
  if (
    status === 401 || status === 402 || status === 403 || status === 404 || status === 405 || status === 501 ||
    (status === 400 && !codeIsInputFailure) ||
    /(?:api_key|model_not_found|unsupported|invalid_request|unauthorized|forbidden|authentication)/i.test(code ?? "")
  ) {
    return {
      category: "provider_configuration",
      retryable: true,
      ...(status === undefined ? {} : { status }),
      ...(providerCode ? { providerCode } : {}),
      ...(providerType ? { providerType } : {}),
      ...(errorName ? { errorName } : {}),
    };
  }
  if (
    status === 400 || status === 413 || status === 415 || status === 422 || codeIsInputFailure
  ) {
    return {
      category: "input_rejected",
      retryable: false,
      ...(status === undefined ? {} : { status }),
      ...(providerCode ? { providerCode } : {}),
      ...(providerType ? { providerType } : {}),
      ...(errorName ? { errorName } : {}),
    };
  }
  return {
    category: "invalid_analysis",
    retryable: false,
    ...(status === undefined ? {} : { status }),
    ...(providerCode ? { providerCode } : {}),
    ...(providerType ? { providerType } : {}),
    ...(errorName ? { errorName } : {}),
  };
}

export function projectImportAnalysisFailureMessage(details: ProjectImportAnalysisErrorDetails): string {
  if (details.category === "temporary_provider") {
    const status = details.status ? ` (provider HTTP ${details.status})` : "";
    return `Project analysis is temporarily unavailable${status}. Your uploaded files are preserved; retry this import after the service recovers.`;
  }
  if (details.category === "provider_configuration") {
    const status = details.status ? ` (provider HTTP ${details.status})` : "";
    return `The project analysis provider rejected the request${status}. Ask a workspace administrator to check the AI integration configuration and access, then retry; your uploaded files are preserved.`;
  }
  if (details.category === "input_rejected") {
    return "The project documents could not be analyzed with the current request. Choose different or smaller files to start a new import.";
  }
  return "Project analysis did not return a valid result. Choose different files to start a new import.";
}
