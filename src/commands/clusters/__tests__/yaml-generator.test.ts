import { describe, expect, it } from 'vitest';

import {
  generateComponentManifest,
  getAvailableComponents,
  getComponentDescription,
} from '../yaml-generator';

describe('yaml-generator', () => {
  describe('getAvailableComponents', () => {
    it('returns all available components', () => {
      const components = getAvailableComponents();
      expect(components).toContain('cert-manager');
      expect(components).toContain('external-dns');
      expect(components).toContain('ingress-nginx');
      expect(components).toContain('cloudnative-pg');
      expect(components).toContain('redis-operator');
      expect(components).toContain('prometheus');
      expect(components).toContain('grafana');
    });
  });

  describe('getComponentDescription', () => {
    it('returns description for cert-manager', () => {
      const desc = getComponentDescription('cert-manager');
      expect(desc).toContain('TLS');
    });

    it('returns component name for unknown component', () => {
      const desc = getComponentDescription('unknown');
      expect(desc).toBe('unknown');
    });
  });

  describe('generateComponentManifest', () => {
    it('generates cert-manager manifest with correct placeholders', () => {
      const manifest = generateComponentManifest('cert-manager', {
        clusterName: 'test-cluster',
        domain: 'test.com',
      });

      expect(manifest.filename).toBe('cert-manager.yaml');
      expect(manifest.content).toContain('name: cert-manager');
      expect(manifest.content).toContain('namespace: cert-manager');
      expect(manifest.content).not.toContain('CLUSTER-NAME');
    });

    it('generates external-dns manifest with replaced placeholders', () => {
      const manifest = generateComponentManifest('external-dns', {
        clusterName: 'prod-cluster',
        domain: 'prod.com',
        dnsServer: '10.0.0.1',
      });

      expect(manifest.content).toContain('external-dns.prod-cluster');
      expect(manifest.content).toContain('prod.com');
      expect(manifest.content).toContain('10.0.0.1');
      expect(manifest.content).not.toContain('example.com');
    });

    it('throws error for unknown component', () => {
      expect(() =>
        generateComponentManifest('unknown-component', {
          clusterName: 'test',
          domain: 'test.com',
        }),
      ).toThrow('Unknown component');
    });
  });
});
