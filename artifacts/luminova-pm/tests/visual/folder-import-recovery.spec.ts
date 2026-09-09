import { expect, test, type Page } from '@playwright/test';

type SessionStatus = 'uploading' | 'building' | 'completed' | 'failed';
type Document = { relativePath: string; name: string; size: number; contentType: string };

const files = [
  { name: 'scope.txt', mimeType: 'text/plain', buffer: Buffer.from('Project scope') },
  { name: 'budget.txt', mimeType: 'text/plain', buffer: Buffer.from('Budget: $1000') },
];

function session(status: SessionStatus, documents: Document[], uploadedPaths: string[], error: string | null = null, importId = 'import-recovery-test') {
  return {
    importId,
    status,
    documents,
    uploadedPaths,
    uploaded: uploadedPaths.length,
    failed: 0,
    error,
  };
}

async function installImportApi(page: Page) {
  let documents: Document[] = [];
  const uploadedPaths = new Set<string>();
  let status: SessionStatus = 'uploading';
  let error: string | null = null;
  let buildRequests = 0;
  let projectsCreated = 0;
  let attachRequests = 0;
  const uploadRequests: string[] = [];
  let holdBuild = false;
  let blockAdditionalAttaches = false;
  let failUploads = false;
  let importId = 'import-recovery-test';

  await page.route('**/api/project-import-sessions', async (route) => {
    if (route.request().method() === 'POST') {
      documents = route.request().postDataJSON().documents;
      await route.fulfill({ status: 201, json: session(status, documents, [...uploadedPaths], null, importId) });
      return;
    }
    await route.fulfill({ json: documents.length ? session(status, documents, [...uploadedPaths], error, importId) : null });
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
  await page.route('**/__folder-upload/**', route => route.fulfill({ status: 200 }));
  await page.route('**/api/project-import-sessions/*/documents', async (route) => {
    attachRequests++;
    if (blockAdditionalAttaches && uploadedPaths.size > 0) {
      await new Promise(() => undefined);
      return;
    }
    uploadedPaths.add(route.request().postDataJSON().relativePath);
    await route.fulfill({ json: session(status, documents, [...uploadedPaths]) });
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
    if (holdBuild) return;
    status = 'completed';
    projectsCreated++;
    await route.fulfill({ status: 201, json: { project: { id: 'recovered-project' } } });
  });

  return {
    uploadedPaths,
    uploadRequests,
    get attachRequests() { return attachRequests; },
    get buildRequests() { return buildRequests; },
    get projectsCreated() { return projectsCreated; },
    setStatus(next: SessionStatus, message: string | null = null) { status = next; error = message; },
    holdBuild() { holdBuild = true; },
    blockAdditionalAttaches(value: boolean) { blockAdditionalAttaches = value; },
    failUploads(value: boolean) { failUploads = value; },
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

  expect(api.uploadRequests.slice(requestsBeforeRecovery)).toEqual(
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

test('dismissed import errors stay hidden for the session when dismissal storage is unavailable', async ({ page }) => {
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
