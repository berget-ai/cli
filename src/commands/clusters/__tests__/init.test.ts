import { describe, expect, it } from 'vitest';

import { FakeCommandRunner } from '../../code/__tests__/fake-command-runner';
import { FakeFileStore } from '../../code/__tests__/fake-file-store';
import { CANCEL, confirm, FakePrompter, multiselect, select, text } from '../../code/__tests__/fake-prompter';

import { CancelledError, PrerequisiteError } from '../../code/errors';

import { runClusterInit } from '../init';

describe('runClusterInit', () => {
  // Helper to create a FakeCommandRunner with all prerequisites installed
  function createCommands(): FakeCommandRunner {
    return new FakeCommandRunner()
      .handle('kubectl --version', '')
      .handle('flux --version', '')
      .handle('git --version', '');
  }

  it('completes full wizard with template repo', async () => {
    const commands = createCommands()
      .handle(/git clone/, '')
      .handle(/rm -rf/, '')
      .handle(/flux bootstrap/, '');

    const files = new FakeFileStore();
    const prompter = new FakePrompter([
      text('my-cluster'),
      text('example.com'),
      select('template'),
      multiselect(['cert-manager', 'external-dns']),
      confirm(true),
      confirm(true),
    ]);

    await runClusterInit(
      { commands, cwd: '/test', files, prompter },
      {},
    );

    prompter.assertExhausted();

    // Verify directories created
    expect(await files.exists('/test/clusters')).toBe(true);
    expect(await files.exists('/test/clusters/flux-system')).toBe(true);
    expect(await files.exists('/test/clusters/infrastructure/cert-manager')).toBe(true);
    expect(await files.exists('/test/clusters/infrastructure/external-dns')).toBe(true);

    // Verify gotk-sync.yaml written
    const gotkSync = await files.readFile('/test/clusters/flux-system/gotk-sync.yaml');
    expect(gotkSync).toContain('name: flux-system');
    expect(gotkSync).toContain('url: https://github.com/berget-ai/berget-k8s-template');

    // Verify component manifests written
    const certManager = await files.readFile('/test/clusters/infrastructure/cert-manager/cert-manager.yaml');
    expect(certManager).toContain('name: cert-manager');
    expect(certManager).toContain('namespace: cert-manager');

    const externalDns = await files.readFile('/test/clusters/infrastructure/external-dns/external-dns.yaml');
    expect(externalDns).toContain('external-dns.my-cluster');
    expect(externalDns).toContain('example.com');
  });

  it('completes wizard with existing repo', async () => {
    const commands = createCommands();

    const files = new FakeFileStore();
    const prompter = new FakePrompter([
      text('prod-cluster'),
      text('berget.ai'),
      select('existing'),
      text('git@github.com:my-org/infra.git'),
      multiselect(['ingress-nginx']),
      confirm(true),
      confirm(false), // Don't run flux bootstrap
    ]);

    await runClusterInit(
      { commands, cwd: '/test', files, prompter },
      {},
    );

    prompter.assertExhausted();

    const gotkSync = await files.readFile('/test/clusters/flux-system/gotk-sync.yaml');
    expect(gotkSync).toContain('git@github.com:my-org/infra.git');

    const ingress = await files.readFile('/test/clusters/infrastructure/ingress-nginx.yaml');
    expect(ingress).toContain('name: ingress-nginx');
  });

  it('skips interactive prompts when all options provided', async () => {
    const commands = createCommands()
      .handle(/git clone/, '')
      .handle(/rm -rf/, '')
      .handle(/flux bootstrap/, '');

    const files = new FakeFileStore();
    const prompter = new FakePrompter([
      confirm(true),
      confirm(false),
    ]);

    await runClusterInit(
      { commands, cwd: '/test', files, prompter },
      {
        clusterName: 'auto-cluster',
        components: ['prometheus', 'grafana'],
        domain: 'auto.example.com',
        templateRepo: true,
      },
    );

    prompter.assertExhausted();

    const prometheus = await files.readFile('/test/clusters/infrastructure/monitoring/prometheus.yaml');
    expect(prometheus).toContain('name: prometheus');

    const grafana = await files.readFile('/test/clusters/infrastructure/monitoring/grafana.yaml');
    expect(grafana).toContain('grafana.auto-cluster.auto.example.com');
  });

  it('throws PrerequisiteError when kubectl is missing', async () => {
    const commands = new FakeCommandRunner();
    // No handlers = nothing is installed

    const files = new FakeFileStore();
    const prompter = new FakePrompter([]);

    await expect(
      runClusterInit({ commands, cwd: '/test', files, prompter }, {}),
    ).rejects.toThrow(PrerequisiteError);
  });

  it('throws CancelledError when user cancels at confirmation', async () => {
    const commands = createCommands();

    const files = new FakeFileStore();
    const prompter = new FakePrompter([
      text('my-cluster'),
      text('example.com'),
      select('template'),
      multiselect(['cert-manager']),
      confirm(false), // Cancel at confirmation
    ]);

    await expect(
      runClusterInit({ commands, cwd: '/test', files, prompter }, {}),
    ).rejects.toThrow(CancelledError);
  });

  it('throws CancelledError when user cancels cluster name prompt', async () => {
    const commands = createCommands();

    const files = new FakeFileStore();
    const prompter = new FakePrompter([
      text(CANCEL),
    ]);

    await expect(
      runClusterInit({ commands, cwd: '/test', files, prompter }, {}),
    ).rejects.toThrow(CancelledError);
  });

  it('handles all available components', async () => {
    const commands = createCommands()
      .handle(/git clone/, '')
      .handle(/rm -rf/, '')
      .handle(/flux bootstrap/, '');

    const files = new FakeFileStore();
    const prompter = new FakePrompter([
      text('full-cluster'),
      text('test.com'),
      select('template'),
      multiselect([
        'cert-manager',
        'external-dns',
        'ingress-nginx',
        'cloudnative-pg',
        'redis-operator',
        'prometheus',
        'grafana',
      ]),
      confirm(true),
      confirm(false),
    ]);

    await runClusterInit(
      { commands, cwd: '/test', files, prompter },
      {},
    );

    prompter.assertExhausted();

    // Verify all components were written
    expect(await files.readFile('/test/clusters/infrastructure/cert-manager/cert-manager.yaml')).toBeTruthy();
    expect(await files.readFile('/test/clusters/infrastructure/external-dns/external-dns.yaml')).toBeTruthy();
    expect(await files.readFile('/test/clusters/infrastructure/ingress-nginx/ingress-nginx.yaml')).toBeTruthy();
    expect(await files.readFile('/test/clusters/infrastructure/operators/cloudnative-pg/cloudnative-pg.yaml')).toBeTruthy();
    expect(await files.readFile('/test/clusters/infrastructure/operators/redis/redis-operator.yaml')).toBeTruthy();
    expect(await files.readFile('/test/clusters/infrastructure/monitoring/prometheus.yaml')).toBeTruthy();
    expect(await files.readFile('/test/clusters/infrastructure/monitoring/grafana.yaml')).toBeTruthy();
  });

  it('exits gracefully when no components selected', async () => {
    const commands = createCommands();

    const files = new FakeFileStore();
    const prompter = new FakePrompter([
      text('empty-cluster'),
      text('example.com'),
      select('template'),
      multiselect([]),
    ]);

    await runClusterInit(
      { commands, cwd: '/test', files, prompter },
      {},
    );

    prompter.assertExhausted();

    // Should not create any component files
    const writtenFiles = files.getWrittenFiles();
    expect(writtenFiles.size).toBe(0);
  });

  it('validates cluster name format', async () => {
    const commands = createCommands()
      .handle(/git clone/, '')
      .handle(/rm -rf/, '')
      .handle(/flux bootstrap/, '');

    const files = new FakeFileStore();
    const prompter = new FakePrompter([
      text('Invalid_Name'), // Invalid: contains underscore and uppercase
      text('valid-name'),
      text('example.com'),
      select('template'),
      multiselect(['cert-manager']),
      confirm(true),
      confirm(false),
    ]);

    await runClusterInit(
      { commands, cwd: '/test', files, prompter },
      {},
    );

    prompter.assertExhausted();

    // Should show validation note and ask again
    const noteCall = prompter.calls.find((c) => c.method === 'note' && c.args.title === 'Invalid name');
    expect(noteCall).toBeDefined();
  });
});
