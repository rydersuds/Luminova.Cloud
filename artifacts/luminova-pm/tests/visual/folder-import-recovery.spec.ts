import { expect, test, type Page } from '@playwright/test';

type SessionStatus = 'uploading' | 'building' | 'completed' | 'failed';
type Document = { relativePath: string; name: string; size: number; contentType: string };

const files = [
  { name: 'scope.txt', mimeType: 'text/plain', buffer: Buffer.from('Project scope') },
  { name: 'budget.txt', mimeType: 'text/plain', buffer: Buffer.from('Budget: $1000') },
];

function session(
  status: SessionStatus,
  documents: Document[],
  uploadedPaths: string[],
  error: string | null = null,
  importId = 'import-recovery-test',
  retryable = status === 'uploading' || status === 'failed',
  failureStage: string | null = null,
) {
  return {
    importId,
    status,
    documents,
    uploadedPaths,
    uploaded: uploadedPaths.length,
    failed: 0,
    retryable,
    failureStage,
    error,
    buildLeaseId: null,
  };
}

async function installImportApi(page: Page) {
  let documents: Document[] = [];
  const uploadedPaths = new Set<string>();
  let status: SessionStatus = 'uploading';
  let error: string | null = null;
  let retryable = true;
  let failureStage: string | null = null;
  let buildRequests = 0;
  let projectsCreated = 0;
  let attachRequests = 0;
  const uploadRequests: string[] = [];
  let holdBuild = false;
  let failBuildResponseWhileBuilding = false;
  let blockAdditionalAttaches = false;
  let failUploads = false;
  let importId = 'import-recovery-test';
  let gatewayBuildFailures = 0;
  let statusCheckFailures = 0;
  let interruptNextBuild = false;
  let returnHistoricalFailureAfterCompletion = false;
  let failAnalysisRequests = 0;
  let nextImportId: string | null = null;
  const dismissedImportIds = new Set<string>();
  let dismissRequests = 0;
  let cancelRequests = 0;
  let holdUploadTransfers = false;
  let releaseHeldUploads: (() => void) | undefined;
  let uploadsReleased = Promise.resolve();
  let holdSessionCreation = false;
  let releaseSessionCreation: (() => void) | undefined;
  let sessionCreationReleased = Promise.resolve();
  let buildStatusChecks = 0;

  await page.route('**/api/project-import-sessions', async (route) => {
    if (route.request().method() === 'POST') {
      if (nextImportId) {
        importId = nextImportId;
        nextImportId = null;
        uploadedPaths.clear();
        status = 'uploading';
        error = null;
        retryable = true;
        failureStage = null;
      }
      documents = route.request().postDataJSON().documents;
      if (holdSessionCreation) await sessionCreationReleased;
      await route.fulfill({ status: 201, json: session(status, documents, [...uploadedPaths], null, importId, retryable, failureStage) });
      return;
    }
    if (statusCheckFailures > 0) {
      statusCheckFailures--;
      await route.fulfill({ status: 502, body: 'Temporary gateway failure' });
      return;
    }
    if (returnHistoricalFailureAfterCompletion && status === 'completed') {
      await route.fulfill({ json: session('failed', documents, [...uploadedPaths], 'An older import failed.', 'older-failed-import') });
      return;
    }
    const activeSession = documents.length && !dismissedImportIds.has(importId)
      ? session(status, documents, [...uploadedPaths], error, importId, retryable, failureStage)
      : null;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(activeSession),
    });
  });
  await page.route('**/api/project-import-sessions/*', async (route) => {
    if (route.request().method() === 'DELETE') {
      dismissRequests++;
      cancelRequests++;
      dismissedImportIds.add(importId);
      await route.fulfill({ status: 204 });
      return;
    }
    if (route.request().method() === 'GET') buildStatusChecks++;
    await route.fulfill({ json: session(status, documents, [...uploadedPaths], error, importId, retryable, failureStage) });
  });
  await page.route('**/api/storage/uploads/request-url', async (route) => {
    const body = route.request().postDataJSON();
    uploadRequests.push(body.relativePath);
    if (failUploads) {
      await route.fulfill({ status: 500, json: { error: 'The upload could not be completed.' } });
      return;
    }
    await route.fulfill({ json: { uploadURL: `http://127.0.0.1:4173/__folder-upload/${body.relativePath}`, objectPath: `/objects/${body.relativePath}` } });
  });
  await page.route('**/__folder-upload/**', async (route) => {
    if (holdUploadTransfers) await uploadsReleased;
    await route.fulfill({ status: 200 });
  });
  await page.route('**/api/project-import-sessions/*/documents', async (route) => {
    attachRequests++;
    if (blockAdditionalAttaches && uploadedPaths.size > 0) {
      await new Promise(() => undefined);
      return;
    }
    uploadedPaths.add(route.request().postDataJSON().relativePath);
    await route.fulfill({ json: session(status, documents, [...uploadedPaths], error, importId, retryable, failureStage) });
  });
  await page.route('**/api/project-import-sessions/*/build', async (route) => {
    buildRequests++;
    if (status === 'completed') {
      await route.fulfill({ status: 409, json: { error: 'This import has already completed.' } });
      return;
    }
    if (status === 'building') {
      await route.fulfill({ status: 409, json: { error: 'This import is already being built.' } });
      return;
    }
    status = 'building';
    if (failBuildResponseWhileBuilding) {
      failBuildResponseWhileBuilding = false;
      await route.fulfill({ status: 502, body: 'Gateway disconnected while the server build remains active' });
      return;
    }
    if (failAnalysisRequests > 0) {
      failAnalysisRequests--;
      status = 'failed';
      error = 'The project documents could not be interpreted. Select different files to start a new import.';
      retryable = false;
      failureStage = 'document analysis';
      await route.fulfill({ status: 422, json: { error } });
      return;
    }
    if (holdBuild) return;
    if (interruptNextBuild) {
      interruptNextBuild = false;
      status = 'failed';
      error = 'The previous build was interrupted. Retry to continue.';
      retryable = true;
      failureStage = 'project build';
      await route.fulfill({ status: 502, body: 'Gateway disconnected' });
      return;
    }
    status = 'completed';
    retryable = false;
    failureStage = null;
    error = null;
    projectsCreated++;
    if (gatewayBuildFailures > 0) {
      gatewayBuildFailures--;
      await route.fulfill({ status: 502, body: 'Gateway disconnected' });
      return;
    }
    await route.fulfill({ status: 201, json: { project: { id: 'recovered-project' } } });
  });

  return {
    uploadedPaths,
    uploadRequests,
    get attachRequests() { return attachRequests; },
    get buildRequests() { return buildRequests; },
    get projectsCreated() { return projectsCreated; },
    get dismissRequests() { return dismissRequests; },
    get cancelRequests() { return cancelRequests; },
    get buildStatusChecks() { return buildStatusChecks; },
    setStatus(next: SessionStatus, message: string | null = null) {
      status = next;
      error = message;
      retryable = next === 'uploading' || next === 'failed';
      failureStage = null;
    },
    holdBuild() { holdBuild = true; },
    failBuildOnceWhileBuilding() { failBuildResponseWhileBuilding = true; },
    blockAdditionalAttaches(value: boolean) { blockAdditionalAttaches = value; },
    failUploads(value: boolean) { failUploads = value; },
    holdUploadTransfers() {
      holdUploadTransfers = true;
      uploadsReleased = new Promise<void>(resolve => { releaseHeldUploads = resolve; });
    },
    releaseUploadTransfers() {
      holdUploadTransfers = false;
      releaseHeldUploads?.();
      releaseHeldUploads = undefined;
    },
    holdSessionCreation() {
      holdSessionCreation = true;
      sessionCreationReleased = new Promise<void>(resolve => { releaseSessionCreation = resolve; });
    },
    releaseSessionCreation() {
      holdSessionCreation = false;
      releaseSessionCreation?.();
      releaseSessionCreation = undefined;
    },
    failNextBuildAtGateway() { gatewayBuildFailures++; },
    failStatusChecks(count: number) { statusCheckFailures = count; },
    interruptNextBuild() { interruptNextBuild = true; },
    returnHistoricalFailureAfterCompletion() { returnHistoricalFailureAfterCompletion = true; },
    failNextBuildAtAnalysis() { failAnalysisRequests++; },
    prepareFreshSession() { nextImportId = 'import-recovery-test-retry'; },
    setImportId(next: string) { importId = next; },
    seedDocuments() {
      documents = files.map(file => ({
        relativePath: file.name,
        name: file.name,
        size: file.buffer.length,
        contentType: file.mimeType,
      }));
    },
  };
}

async function selectAndStart(page: Page) {
  await page.goto('/__visual/folder-import');
  await page.getByLabel('Project folder files').setInputFiles(files);
  await page.getByRole('button', { name: 'Start import' }).click();
}

async function makeDismissalStorageUnavailable(page: Page) {
  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    const isImportDismissalKey = (key: string | null) => key?.startsWith('luminova-folder-import-dismissed:') === true;

    Storage.prototype.getItem = function (key) {
      if (isImportDismissalKey(key)) throw new Error('Dismissal storage is unavailable');
      return originalGetItem.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (isImportDismissalKey(key)) throw new Error('Dismissal storage is unavailable');
      return originalSetItem.call(this, key, value);
    };
  });
}

test('canceling a project folder upload aborts active transfers and prevents project creation', async ({ page }) => {
  const api = await installImportApi(page);
  api.holdUploadTransfers();

  await selectAndStart(page);
  const cancelButton = page.getByRole('button', { name: 'Cancel upload' });
  await expect(cancelButton).toBeVisible();
  await expect.poll(() => api.uploadRequests.length).toBeGreaterThan(0);
  await cancelButton.click();

  await expect(page.getByLabel('Import status')).toHaveText('idle');
  expect(api.cancelRequests).toBe(1);
  expect(api.buildRequests).toBe(0);
  expect(api.projectsCreated).toBe(0);
  expect(api.uploadRequests.length).toBeGreaterThan(0);
  api.releaseUploadTransfers();
});

test('canceling while the import session is being created waits before dismissing it', async ({ page }) => {
  const api = await installImportApi(page);
  api.holdSessionCreation();

  await page.goto('/__visual/folder-import');
  await page.getByLabel('Project folder files').setInputFiles(files);
  await page.getByRole('button', { name: 'Start import' }).click();

  const cancelButton = page.getByRole('button', { name: 'Cancel upload' });
  await expect(cancelButton).toBeVisible();
  await cancelButton.click();
  await expect(page.getByRole('button', { name: 'Canceling…' })).toBeVisible();
  expect(api.cancelRequests).toBe(0);

  api.releaseSessionCreation();
  await expect(page.getByLabel('Import status')).toHaveText('idle');
  expect(api.cancelRequests).toBe(1);
  expect(api.uploadRequests).toHaveLength(0);
  expect(api.buildRequests).toBe(0);
});

test('project upload cannot be canceled after building begins', async ({ page }) => {
  const api = await installImportApi(page);
  api.holdBuild();

  await selectAndStart(page);
  await expect(page.getByLabel('Import status')).toHaveText('building');
  await expect.poll(() => api.buildRequests).toBe(1);
  await expect(page.getByRole('button', { name: 'Cancel upload' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancel project upload' })).toHaveCount(0);
  expect(api.cancelRequests).toBe(0);
});

async function blockDismissalStorageObject(page: Page) {
  const installBlock = () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('Dismissal storage is unavailable');
      },
    });
  };
  await page.evaluate(installBlock);
}

async function makeImportFileStorageUnavailable(page: Page, failure: 'open' | 'transaction') {
  await page.addInitScript((failureType: 'open' | 'transaction') => {
    if (failureType === 'open') {
      const originalOpen = IDBFactory.prototype.open;
      let failed = false;
      IDBFactory.prototype.open = function (name: string, version?: number) {
        if (!failed) {
          failed = true;
          throw new DOMException('IndexedDB open failed', 'UnknownError');
        }
        return originalOpen.call(this, name, version);
      };
      return;
    }

    const originalTransaction = IDBDatabase.prototype.transaction;
    let failed = false;
    IDBDatabase.prototype.transaction = function (
      storeNames: string | string[],
      mode?: IDBTransactionMode,
      options?: IDBTransactionOptions,
    ) {
      if (!failed) {
        failed = true;
        throw new DOMException('IndexedDB transaction failed', 'UnknownError');
      }
      return originalTransaction.call(this, storeNames, mode, options);
    };
  }, failure);
}

async function makeImportCleanupStorageUnavailable(page: Page) {
  await page.addInitScript(() => {
    const originalTransaction = IDBDatabase.prototype.transaction;
    let successfulTransactions = 0;
    IDBDatabase.prototype.transaction = function (
      storeNames: string | string[],
      mode?: IDBTransactionMode,
      options?: IDBTransactionOptions,
    ) {
      if (successfulTransactions >= 2) {
        throw new DOMException('IndexedDB cleanup transaction failed', 'UnknownError');
      }
      const transaction = originalTransaction.call(this, storeNames, mode, options);
      successfulTransactions++;
      return transaction;
    };
  });
}

test('reload resumes an interrupted import by uploading only missing files', async ({ page }) => {
  const api = await installImportApi(page);
  api.blockAdditionalAttaches(true);

  await selectAndStart(page);
  await expect.poll(() => api.uploadedPaths.size).toBe(1);
  const attachedBeforeReload = [...api.uploadedPaths];
  api.blockAdditionalAttaches(false);
  const requestsBeforeRecovery = api.uploadRequests.length;
  await page.reload();
  await expect(page.getByLabel('Import status')).toHaveText('success', { timeout: 10_000 });

  expect([...new Set(api.uploadRequests.slice(requestsBeforeRecovery))]).toEqual(
    files.map(file => file.name).filter(path => !attachedBeforeReload.includes(path)),
  );
  expect(api.uploadedPaths.size).toBe(2);
  expect(api.buildRequests).toBe(1);
  expect(api.projectsCreated).toBe(1);

  const duplicateBuildStatus = await page.evaluate(async () =>
    (await fetch('/api/project-import-sessions/import-recovery-test/build', { method: 'POST' })).status,
  );
  expect(duplicateBuildStatus).toBe(409);
  expect(api.projectsCreated).toBe(1);
});

test('reload while building polls until the existing build resolves', async ({ page }) => {
  const api = await installImportApi(page);
  api.holdBuild();
  await selectAndStart(page);
  await expect(page.getByLabel('Import status')).toHaveText('building');
  expect(api.buildRequests).toBe(1);

  await page.reload();
  await expect(page.getByLabel('Import status')).toHaveText('building');
  api.setStatus('completed');
  await expect(page.getByLabel('Import status')).toHaveText('success', { timeout: 5_000 });
  expect(api.buildRequests).toBe(1);
});

test('a long-running build keeps polling instead of reporting a false timeout', async ({ page }) => {
  const api = await installImportApi(page);
  api.failBuildOnceWhileBuilding();
  await selectAndStart(page);
  await expect.poll(() => api.buildStatusChecks, { timeout: 5_000 }).toBeGreaterThan(0);
  await page.evaluate(() => {
    const originalSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      originalSetTimeout(handler, timeout !== undefined && timeout >= 2000 ? 10 : timeout, ...args)) as typeof window.setTimeout;
  });
  await expect.poll(() => api.buildStatusChecks, { timeout: 10_000 }).toBeGreaterThan(45);
  await expect(page.getByLabel('Import status')).toHaveText('building');

  api.setStatus('completed');
  await expect(page.getByLabel('Import status')).toHaveText('success', { timeout: 5_000 });
  expect(api.buildRequests).toBe(1);
});

test('a gateway failure after server completion reconciles to success without a duplicate build', async ({ page }) => {
  const api = await installImportApi(page);
  api.failNextBuildAtGateway();
  api.returnHistoricalFailureAfterCompletion();

  await selectAndStart(page);
  await expect(page.getByLabel('Import status')).toHaveText('success', { timeout: 10_000 });
  expect(api.buildRequests).toBe(1);
  expect(api.projectsCreated).toBe(1);
});

test('temporary build-status gateway failures do not stop recovery', async ({ page }) => {
  const api = await installImportApi(page);
  api.holdBuild();
  await selectAndStart(page);
  await expect(page.getByLabel('Import status')).toHaveText('building');

  api.failStatusChecks(2);
  await page.reload();
  await expect(page.getByLabel('Import status')).toHaveText('building');
  await page.waitForTimeout(4_500);
  api.setStatus('completed');

  await expect(page.getByLabel('Import status')).toHaveText('success', { timeout: 5_000 });
  expect(api.buildRequests).toBe(1);
});

test('dismissed restore errors stay hidden while the gateway remains unavailable', async ({ page }) => {
  const api = await installImportApi(page);
  api.failStatusChecks(20);

  await page.goto('/__visual/folder-import');
  const activity = page.getByRole('complementary', { name: 'Project folder import activity' });
  await expect(activity.getByRole('alert')).toContainText('Restoring the import session failed (HTTP 502)');

  await activity.getByRole('button', { name: 'Dismiss error' }).click();
  await expect(activity).not.toBeVisible();
  await page.waitForTimeout(3_500);
  await expect(activity).not.toBeVisible();
});

test('an interrupted build retries the preserved session exactly once', async ({ page }) => {
  const api = await installImportApi(page);
  api.interruptNextBuild();

  await selectAndStart(page);
  await expect(page.getByLabel('Import status')).toHaveText('success', { timeout: 10_000 });
  expect(api.uploadRequests).toHaveLength(2);
  expect(api.attachRequests).toBe(2);
  expect(api.buildRequests).toBe(2);
  expect(api.projectsCreated).toBe(1);
});

test('a permanent analysis failure shows its stage and requires a fresh import', async ({ page }) => {
  const api = await installImportApi(page);
  api.failNextBuildAtAnalysis();

  await selectAndStart(page);
  const activity = page.getByRole('complementary', { name: 'Project folder import activity' });
  await expect(activity.getByRole('alert')).toContainText('Document analysis failed');
  await expect(activity.getByRole('alert')).toContainText('Select different files to start a new import');
  expect(api.buildRequests).toBe(1);
  expect(api.projectsCreated).toBe(0);

  api.prepareFreshSession();
  await page.getByLabel('Project folder files').setInputFiles(files);
  await page.getByRole('button', { name: 'Start import' }).click();
  await expect(page.getByLabel('Import status')).toHaveText('success', { timeout: 10_000 });
  expect(api.buildRequests).toBe(2);
  expect(api.uploadRequests).toHaveLength(4);
  expect(api.projectsCreated).toBe(1);
});

test('completed import stays successful when browser cleanup fails', async ({ page }) => {
  const api = await installImportApi(page);
  await makeImportCleanupStorageUnavailable(page);

  await selectAndStart(page);
  await expect(page.getByLabel('Import status')).toHaveText('success', { timeout: 10_000 });
  await page.waitForTimeout(1_500);

  expect(api.projectsCreated).toBe(1);
  await expect(page.getByLabel('Import status')).toHaveText('success');
  await expect(page.getByTestId('dashboard-import-alert')).toHaveCount(0);
});

test('dismissed import errors stay hidden for the session when dismissal storage is unavailable', async ({ page }) => {
  const api = await installImportApi(page);
  api.setImportId('import-storage-unavailable');
  api.failUploads(true);
  await makeDismissalStorageUnavailable(page);

  await selectAndStart(page);
  const activity = page.getByRole('complementary', { name: 'Project folder import activity' });
  const dashboardAlert = page.getByTestId('dashboard-import-alert');
  await expect(activity.getByRole('alert')).toContainText('2 files still need to be uploaded');
  await expect(activity.getByRole('alert')).toContainText('Uploading failed.');
  await expect(dashboardAlert).toContainText('2 files still need to be uploaded');

  await activity.getByRole('button', { name: 'Dismiss error' }).click();
  await expect(activity).not.toBeVisible();
  await expect(dashboardAlert).not.toBeVisible();
  await expect(page.evaluate(() => {
    try {
      localStorage.getItem('luminova-folder-import-dismissed:import-storage-unavailable');
      return false;
    } catch {
      return true;
    }
  })).resolves.toBe(true);

  await page.reload();
  await expect(activity).not.toBeVisible();
  await expect(dashboardAlert).not.toBeVisible();
  await expect.poll(() => api.dismissRequests).toBe(1);
});

test('dismissed import errors stay hidden after refresh without suppressing a new import', async ({ page }) => {
  const api = await installImportApi(page);
  api.setImportId('import-dismissed');
  api.failUploads(true);

  await selectAndStart(page);
  const activity = page.getByRole('complementary', { name: 'Project folder import activity' });
  const dashboardAlert = page.getByTestId('dashboard-import-alert');
  await expect(activity.getByRole('alert')).toContainText('2 files still need to be uploaded');
  await expect(dashboardAlert).toContainText('2 files still need to be uploaded');

  await activity.getByRole('button', { name: 'Dismiss error' }).click();
  await expect(activity).not.toBeVisible();
  await expect(dashboardAlert).not.toBeVisible();
  await expect.poll(() => api.dismissRequests).toBe(1);
  await expect(page.evaluate(() => localStorage.getItem('luminova-folder-import-dismissed:import-dismissed'))).resolves.toBe('true');

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(activity).not.toBeVisible();
  await expect(dashboardAlert).not.toBeVisible();

  api.setImportId('import-new');
  await page.getByLabel('Project folder files').setInputFiles(files);
  await page.getByRole('button', { name: 'Start import' }).click();
  await expect(activity.getByRole('alert')).toContainText('2 files still need to be uploaded');
  await expect(dashboardAlert).toContainText('2 files still need to be uploaded');
  await expect(page.evaluate(() => localStorage.getItem('luminova-folder-import-dismissed:import-new'))).resolves.toBeNull();
});

for (const failure of ['open', 'transaction'] as const) {
  test(`a ${failure} failure during recovery explains the retry and accepts a new folder`, async ({ page }) => {
    const api = await installImportApi(page);
    api.setImportId(`import-storage-${failure}`);
    api.seedDocuments();
    api.setStatus('failed', 'The previous build was interrupted. Retry to continue.');
    await makeImportFileStorageUnavailable(page, failure);

    await page.goto('/__visual/folder-import');
    const activity = page.getByRole('complementary', { name: 'Project folder import activity' });
    const dashboardAlert = page.getByTestId('dashboard-import-alert');
    await expect(activity.getByRole('alert')).toContainText('Browser file storage is unavailable');
    await expect(activity.getByRole('alert')).toContainText('Select the project folder again to retry');
    await expect(dashboardAlert).toContainText('Browser file storage is unavailable');
    await expect(dashboardAlert).toContainText('Select the project folder again to retry');

    await page.getByLabel('Project folder files').setInputFiles(files);
    await page.getByRole('button', { name: 'Start import' }).click();
    await expect(page.getByLabel('Import status')).toHaveText('success', { timeout: 10_000 });
    expect(api.projectsCreated).toBe(1);
    expect(api.uploadedPaths.size).toBe(2);
  });
}

test('a stale build becomes retryable without duplicating attached documents', async ({ page }) => {
  const api = await installImportApi(page);
  api.seedDocuments();
  api.uploadedPaths.add('scope.txt');
  api.uploadedPaths.add('budget.txt');
  api.setStatus('failed', 'The previous build was interrupted. Retry to continue.');

  await page.goto('/__visual/folder-import');
  await expect(page.getByRole('complementary', { name: 'Project folder import activity' }).getByRole('alert')).toContainText('previous build was interrupted');
  await page.getByLabel('Project folder files').setInputFiles(files);
  await page.getByRole('button', { name: 'Start import' }).click();
  await expect(page.getByLabel('Import status')).toHaveText('success');
  expect(api.attachRequests).toBe(0);
  expect(api.buildRequests).toBe(1);
  expect(api.projectsCreated).toBe(1);
});
