/**
 * Command structure constants for the CLI
 * Following patterns from AWS CLI and Google Cloud CLI
 */

// Main command groups
export const COMMAND_GROUPS = {
  API_KEYS: 'api-keys',
  APPS: 'apps',
  AUTH: 'auth',
  BILLING: 'billing',
  CHAT: 'chat',
  CLUSTERS: 'clusters',
  CODE: 'code',
  FLUX: 'flux',
  HELM: 'helm',
  KUBECTL: 'kubectl',
  MODELS: 'models',
  USERS: 'users',
};

// Subcommands for each group
export const SUBCOMMANDS = {
  // API Keys commands
  API_KEYS: {
    CREATE: 'create',
    DELETE: 'delete',
    DESCRIBE: 'describe',
    GET_DEFAULT: 'get-default',
    LIST: 'list',
    ROTATE: 'rotate',
    SET_DEFAULT: 'set-default',
  },

  // Apps commands
  APPS: {
    DESCRIBE_INSTALLATION: 'describe-installation',
    DESCRIBE_TEMPLATE: 'describe-template',
    INSTALL: 'install',
    LIST_INSTALLATIONS: 'list-installations',
    LIST_TEMPLATES: 'list-templates',
    UNINSTALL: 'uninstall',
  },

  // Auth commands
  AUTH: {
    LOGIN: 'login',
    LOGOUT: 'logout',
    WHOAMI: 'whoami',
  },

  // Billing commands
  BILLING: {
    ADD_PAYMENT_METHOD: 'add-payment-method',
    DESCRIBE_INVOICE: 'describe-invoice',
    GET_USAGE: 'get-usage',
    LIST_INVOICES: 'list-invoices',
    LIST_PAYMENT_METHODS: 'list-payment-methods',
    REMOVE_PAYMENT_METHOD: 'remove-payment-method',
    UPDATE_SUBSCRIPTION: 'update-subscription',
  },

  // Chat commands
  CHAT: {
    LIST: 'list',
    RUN: 'run',
  },

  // Clusters commands
  CLUSTERS: {
    DESCRIBE: 'describe',
    GET_USAGE: 'get-usage',
    LIST: 'list',
  },

  // Code commands
  CODE: {
    INIT: 'init',
  },

  // Flux commands
  FLUX: {
    BOOTSTRAP: 'bootstrap',
    INSTALL: 'install',
  },

  // Helm commands
  HELM: {
    ADD_REPO: 'add-repo',
    INSTALL: 'install',
  },

  // Kubectl commands
  KUBECTL: {
    APPLY: 'apply',
    CREATE_NAMESPACE: 'create-namespace',
    GET: 'get',
  },

  // Models commands
  MODELS: {
    DESCRIBE: 'describe',
    LIST: 'list',
  },

  // Users commands
  USERS: {
    DESCRIBE: 'describe',
    INVITE: 'invite',
    LIST: 'list',
    UPDATE: 'update',
  },
};
