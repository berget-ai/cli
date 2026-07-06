/**
 * YAML Generator for cluster infrastructure components
 * Generates FluxCD-compatible manifests based on berget-k8s-template
 */

export interface ComponentConfig {
  clusterName: string;
  domain: string;
  dnsServer?: string;
  storageClass?: string;
}

export interface GeneratedManifest {
  content: string;
  filename: string;
  namespace: string;
}

const PLACEHOLDERS = {
  CLUSTER_NAME: 'CLUSTER-NAME',
  DOMAIN: 'example.com',
  DNS_SERVER: '1.2.3.4',
  STORAGE_CLASS: 'standard',
};

function replacePlaceholders(content: string, config: ComponentConfig): string {
  return content
    .replaceAll(PLACEHOLDERS.CLUSTER_NAME, config.clusterName)
    .replaceAll(PLACEHOLDERS.DOMAIN, config.domain)
    .replaceAll(PLACEHOLDERS.DNS_SERVER, config.dnsServer || PLACEHOLDERS.DNS_SERVER)
    .replaceAll(PLACEHOLDERS.STORAGE_CLASS, config.storageClass || PLACEHOLDERS.STORAGE_CLASS);
}

// Base cert-manager manifest from berget-k8s-template
const CERT_MANAGER_BASE = `---
# cert-manager: Automated TLS certificate management
# https://cert-manager.io/
apiVersion: v1
kind: Namespace
metadata:
  name: cert-manager
---
apiVersion: source.toolkit.fluxcd.io/v1beta2
kind: HelmRepository
metadata:
  name: cert-manager
  namespace: cert-manager
spec:
  interval: 24h
  url: https://charts.jetstack.io
---
apiVersion: helm.toolkit.fluxcd.io/v2beta1
kind: HelmRelease
metadata:
  name: cert-manager
  namespace: cert-manager
spec:
  interval: 30m
  chart:
    spec:
      chart: cert-manager
      version: "1.x"
      sourceRef:
        kind: HelmRepository
        name: cert-manager
        namespace: cert-manager
      interval: 12h
  values:
    installCRDs: true
    extraArgs:
      - --dns01-recursive-nameservers-only
      - --dns01-recursive-nameservers=1.1.1.1:53,8.8.8.8:53
      - --dns01-check-retry-period=30s
    config:
      featureGates:
        ACMEHTTP01IngressPathTypeExact: false
`;

// Base external-dns manifest from berget-k8s-template
const EXTERNAL_DNS_BASE = `---
# external-dns: Automatic DNS record management
# https://github.com/kubernetes-sigs/external-dns
apiVersion: v1
kind: Namespace
metadata:
  name: external-dns
---
apiVersion: source.toolkit.fluxcd.io/v1beta2
kind: HelmRepository
metadata:
  name: bitnami
  namespace: flux-system
spec:
  interval: 24h
  url: https://charts.bitnami.com/bitnami
---
apiVersion: helm.toolkit.fluxcd.io/v2beta1
kind: HelmRelease
metadata:
  name: external-dns
  namespace: external-dns
spec:
  interval: 30m
  chart:
    spec:
      chart: external-dns
      version: "8.x"
      sourceRef:
        kind: HelmRepository
        name: bitnami
        namespace: flux-system
      interval: 12h
  values:
    installCRDs: true
    interval: 2m
    provider: rfc2136
    registry: txt
    sources:
      - ingress
      - service
    txtOwnerId: external-dns.CLUSTER-NAME
    policy: sync
    domainFilters:
      - example.com
    rfc2136:
      host: "1.2.3.4"
      port: 53
      zone: "example.com"
      secretName: external-dns-tsig
      tsigKeyname: "external-dns"
      tsigSecretAlg: "hmac-sha512"
      tsigAxfr: true
`;

// Base ingress-nginx manifest from berget-k8s-template
const INGRESS_NGINX_BASE = `---
# NGINX Ingress Controller
# https://kubernetes.github.io/ingress-nginx/
apiVersion: v1
kind: Namespace
metadata:
  name: ingress-nginx
---
apiVersion: source.toolkit.fluxcd.io/v1beta2
kind: HelmRepository
metadata:
  name: ingress-nginx
  namespace: ingress-nginx
spec:
  interval: 24h
  url: https://kubernetes.github.io/ingress-nginx
---
apiVersion: helm.toolkit.fluxcd.io/v2beta1
kind: HelmRelease
metadata:
  name: ingress-nginx
  namespace: ingress-nginx
spec:
  interval: 30m
  chart:
    spec:
      chart: ingress-nginx
      version: "4.x"
      sourceRef:
        kind: HelmRepository
        name: ingress-nginx
        namespace: ingress-nginx
      interval: 12h
  values:
    controller:
      service:
        type: LoadBalancer
        annotations: {}
      resources:
        requests:
          cpu: 100m
          memory: 128Mi
        limits:
          cpu: 500m
          memory: 512Mi
      metrics:
        enabled: true
        serviceMonitor:
          enabled: true
`;

// Base CloudNativePG manifest from berget-k8s-template
const CLOUDNATIVE_PG_BASE = `---
# CloudNativePG Operator
# https://cloudnative-pg.io/
apiVersion: v1
kind: Namespace
metadata:
  name: cnpg-system
---
apiVersion: source.toolkit.fluxcd.io/v1beta2
kind: HelmRepository
metadata:
  name: cnpg
  namespace: flux-system
spec:
  interval: 30m
  url: https://cloudnative-pg.github.io/charts
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: cloudnative-pg
  namespace: flux-system
spec:
  interval: 10m
  chart:
    spec:
      chart: cloudnative-pg
      version: ">=0.21.0"
      sourceRef:
        kind: HelmRepository
        name: cnpg
        namespace: flux-system
  targetNamespace: cnpg-system
  values:
    config:
      data:
        INHERITED_ANNOTATIONS: "external-dns.alpha.kubernetes.io/hostname"
        INHERITED_LABELS: ""
    resources:
      limits:
        cpu: 500m
        memory: 512Mi
      requests:
        cpu: 200m
        memory: 256Mi
    monitoring:
      enabled: true
      createPodMonitor: true
`;

// Base Redis Operator manifest from berget-k8s-template
const REDIS_OPERATOR_BASE = `---
# Redis Operator (Opstree)
# https://github.com/OT-CONTAINER-KIT/redis-operator
apiVersion: source.toolkit.fluxcd.io/v1beta2
kind: HelmRepository
metadata:
  name: ot-helm
  namespace: flux-system
spec:
  interval: 30m
  url: https://ot-container-kit.github.io/helm-charts/
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: redis-operator
  namespace: flux-system
spec:
  interval: 10m
  chart:
    spec:
      chart: redis-operator
      version: ">=0.22.0"
      sourceRef:
        kind: HelmRepository
        name: ot-helm
        namespace: flux-system
  targetNamespace: kube-system
  values:
    resources:
      limits:
        cpu: 100m
        memory: 200Mi
      requests:
        cpu: 100m
        memory: 200Mi
    serviceMonitor:
      enabled: true
`;

// Base Prometheus manifest from berget-k8s-template
const PROMETHEUS_BASE = `---
# Prometheus Monitoring Stack
# https://github.com/prometheus-community/helm-charts
apiVersion: v1
kind: Namespace
metadata:
  name: monitoring
---
apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: prometheus-community
  namespace: monitoring
spec:
  interval: 1h
  url: https://prometheus-community.github.io/helm-charts
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: prometheus
  namespace: monitoring
spec:
  interval: 10m
  timeout: 10m
  chart:
    spec:
      chart: prometheus
      version: "25.x"
      sourceRef:
        kind: HelmRepository
        name: prometheus-community
        namespace: monitoring
      interval: 1h
  values:
    alertmanager:
      enabled: true
    kube-state-metrics:
      enabled: true
    prometheus-node-exporter:
      enabled: true
    prometheus-pushgateway:
      enabled: false
    server:
      retention: "15d"
      persistentVolume:
        enabled: true
        size: 50Gi
        storageClass: "standard"
      resources:
        limits:
          cpu: 2000m
          memory: 8Gi
        requests:
          cpu: 500m
          memory: 2Gi
      extraArgs:
        storage.tsdb.wal-compression: null
`;

// Base Grafana manifest from berget-k8s-template
const GRAFANA_BASE = `---
# Grafana - Visualization and Dashboards
# https://grafana.com/
apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: grafana
  namespace: monitoring
spec:
  interval: 1h
  url: https://grafana.github.io/helm-charts
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: grafana
  namespace: monitoring
spec:
  interval: 10m
  chart:
    spec:
      chart: grafana
      version: "7.x"
      sourceRef:
        kind: HelmRepository
        name: grafana
        namespace: monitoring
      interval: 1h
  values:
    admin:
      existingSecret: grafana-admin-credentials
    ingress:
      enabled: true
      ingressClassName: nginx
      hosts:
        - grafana.CLUSTER-NAME.example.com
      tls:
        - secretName: grafana-tls
          hosts:
            - grafana.CLUSTER-NAME.example.com
    datasources:
      datasources.yaml:
        apiVersion: 1
        datasources:
          - name: Prometheus
            type: prometheus
            url: http://prometheus-server.monitoring.svc.cluster.local
            access: proxy
            isDefault: true
    persistence:
      enabled: true
      size: 10Gi
      storageClassName: standard
    resources:
      limits:
        cpu: 500m
        memory: 512Mi
      requests:
        cpu: 100m
        memory: 128Mi
`;

export const COMPONENT_MANIFESTS: Record<string, string> = {
  'cert-manager': CERT_MANAGER_BASE,
  'external-dns': EXTERNAL_DNS_BASE,
  'ingress-nginx': INGRESS_NGINX_BASE,
  'cloudnative-pg': CLOUDNATIVE_PG_BASE,
  'redis-operator': REDIS_OPERATOR_BASE,
  'prometheus': PROMETHEUS_BASE,
  'grafana': GRAFANA_BASE,
};

export function generateComponentManifest(
  component: string,
  config: ComponentConfig,
): GeneratedManifest {
  const base = COMPONENT_MANIFESTS[component];
  if (!base) {
    throw new Error(`Unknown component: ${component}`);
  }

  const content = replacePlaceholders(base, config);

  // Determine namespace from the manifest
  const namespaceMatch = content.match(/name: ([a-z-]+)/);
  const namespace = namespaceMatch ? namespaceMatch[1] : 'default';

  return {
    content,
    filename: `${component}.yaml`,
    namespace,
  };
}

export function getAvailableComponents(): string[] {
  return Object.keys(COMPONENT_MANIFESTS);
}

export function getComponentDescription(component: string): string {
  const descriptions: Record<string, string> = {
    'cert-manager': 'Automated TLS certificate management (Let\'s Encrypt)',
    'external-dns': 'Automatic DNS record management via RFC2136',
    'ingress-nginx': 'HTTP/HTTPS ingress controller',
    'cloudnative-pg': 'Production-grade PostgreSQL operator',
    'redis-operator': 'Redis standalone/cluster/sentinel operator',
    'prometheus': 'Metrics collection and alerting',
    'grafana': 'Visualization dashboards for metrics',
  };
  return descriptions[component] || component;
}
