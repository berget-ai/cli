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

// Command descriptions
export const COMMAND_DESCRIPTIONS = {
  [`${COMMAND_GROUPS.API_KEYS} ${SUBCOMMANDS.API_KEYS.CREATE}`]: 'Create a new API key',
  [`${COMMAND_GROUPS.API_KEYS} ${SUBCOMMANDS.API_KEYS.DELETE}`]: 'Delete an API key',
  [`${COMMAND_GROUPS.API_KEYS} ${SUBCOMMANDS.API_KEYS.DESCRIBE}`]:
    'Get usage statistics for an API key',
  [`${COMMAND_GROUPS.API_KEYS} ${SUBCOMMANDS.API_KEYS.GET_DEFAULT}`]:
    'Show the current default API key',

  [`${COMMAND_GROUPS.API_KEYS} ${SUBCOMMANDS.API_KEYS.LIST}`]: 'List all API keys',
  [`${COMMAND_GROUPS.API_KEYS} ${SUBCOMMANDS.API_KEYS.ROTATE}`]: 'Rotate an API key',
  [`${COMMAND_GROUPS.API_KEYS} ${SUBCOMMANDS.API_KEYS.SET_DEFAULT}`]:
    'Set an API key as the default for chat commands',
  [`${COMMAND_GROUPS.APPS} ${SUBCOMMANDS.APPS.DESCRIBE_INSTALLATION}`]:
    'Get detailed information about an installed application',
  [`${COMMAND_GROUPS.APPS} ${SUBCOMMANDS.APPS.DESCRIBE_TEMPLATE}`]:
    'Get detailed information about an application template',
  [`${COMMAND_GROUPS.APPS} ${SUBCOMMANDS.APPS.INSTALL}`]: 'Install an application',
  [`${COMMAND_GROUPS.APPS} ${SUBCOMMANDS.APPS.LIST_INSTALLATIONS}`]: 'List installed applications',
  [`${COMMAND_GROUPS.APPS} ${SUBCOMMANDS.APPS.LIST_TEMPLATES}`]:
    'List available application templates',

  [`${COMMAND_GROUPS.APPS} ${SUBCOMMANDS.APPS.UNINSTALL}`]: 'Uninstall an application',
  [`${COMMAND_GROUPS.AUTH} ${SUBCOMMANDS.AUTH.LOGIN}`]: 'Log in to Berget AI',
  [`${COMMAND_GROUPS.AUTH} ${SUBCOMMANDS.AUTH.LOGOUT}`]: 'Log out from Berget AI',
  [`${COMMAND_GROUPS.AUTH} ${SUBCOMMANDS.AUTH.WHOAMI}`]: 'Display current user information',

  [`${COMMAND_GROUPS.BILLING} ${SUBCOMMANDS.BILLING.ADD_PAYMENT_METHOD}`]:
    'Add a new payment method',
  [`${COMMAND_GROUPS.BILLING} ${SUBCOMMANDS.BILLING.DESCRIBE_INVOICE}`]:
    'Get detailed information about an invoice',
  [`${COMMAND_GROUPS.BILLING} ${SUBCOMMANDS.BILLING.GET_USAGE}`]: 'Get current usage metrics',
  [`${COMMAND_GROUPS.BILLING} ${SUBCOMMANDS.BILLING.LIST_INVOICES}`]: 'List all invoices',
  [`${COMMAND_GROUPS.BILLING} ${SUBCOMMANDS.BILLING.LIST_PAYMENT_METHODS}`]:
    'List all payment methods',
  [`${COMMAND_GROUPS.BILLING} ${SUBCOMMANDS.BILLING.REMOVE_PAYMENT_METHOD}`]:
    'Remove a payment method',
  [`${COMMAND_GROUPS.BILLING} ${SUBCOMMANDS.BILLING.UPDATE_SUBSCRIPTION}`]:
    'Update subscription plan',

  [`${COMMAND_GROUPS.CHAT} ${SUBCOMMANDS.CHAT.LIST}`]: 'List available chat models',
  [`${COMMAND_GROUPS.CHAT} ${SUBCOMMANDS.CHAT.RUN}`]: 'Run a chat session with a specified model',
  [`${COMMAND_GROUPS.CLUSTERS} ${SUBCOMMANDS.CLUSTERS.DESCRIBE}`]:
    'Get detailed information about a cluster',

  [`${COMMAND_GROUPS.CLUSTERS} ${SUBCOMMANDS.CLUSTERS.GET_USAGE}`]:
    'Get resource usage for a cluster',
  [`${COMMAND_GROUPS.CLUSTERS} ${SUBCOMMANDS.CLUSTERS.LIST}`]: 'List all clusters',
  [`${COMMAND_GROUPS.CODE} ${SUBCOMMANDS.CODE.INIT}`]:
    'Interactive setup for Berget AI coding tools',

  [`${COMMAND_GROUPS.FLUX} ${SUBCOMMANDS.FLUX.BOOTSTRAP}`]: 'Bootstrap Flux CD',
  [`${COMMAND_GROUPS.FLUX} ${SUBCOMMANDS.FLUX.INSTALL}`]: 'Install Flux CD',
  [`${COMMAND_GROUPS.HELM} ${SUBCOMMANDS.HELM.ADD_REPO}`]: 'Add a Helm repository',

  [`${COMMAND_GROUPS.HELM} ${SUBCOMMANDS.HELM.INSTALL}`]: 'Install a Helm chart',
  [`${COMMAND_GROUPS.KUBECTL} ${SUBCOMMANDS.KUBECTL.APPLY}`]: 'Apply a Kubernetes configuration',
  [`${COMMAND_GROUPS.KUBECTL} ${SUBCOMMANDS.KUBECTL.CREATE_NAMESPACE}`]:
    'Create a Kubernetes namespace',
  [`${COMMAND_GROUPS.KUBECTL} ${SUBCOMMANDS.KUBECTL.GET}`]: 'Get Kubernetes resources',
  [`${COMMAND_GROUPS.MODELS} ${SUBCOMMANDS.MODELS.DESCRIBE}`]:
    'Get detailed information about an AI model',

  [`${COMMAND_GROUPS.MODELS} ${SUBCOMMANDS.MODELS.LIST}`]: 'List available AI models',
  [`${COMMAND_GROUPS.USERS} ${SUBCOMMANDS.USERS.DESCRIBE}`]:
    'Get detailed information about a user',
  [`${COMMAND_GROUPS.USERS} ${SUBCOMMANDS.USERS.INVITE}`]: 'Invite a new user to your organization',
  [`${COMMAND_GROUPS.USERS} ${SUBCOMMANDS.USERS.LIST}`]: 'List all users in your organization',
  [`${COMMAND_GROUPS.USERS} ${SUBCOMMANDS.USERS.UPDATE}`]: 'Update user information',
  // API Keys group
  [COMMAND_GROUPS.API_KEYS]: 'Manage API keys',
  // Apps group
  [COMMAND_GROUPS.APPS]: 'Manage applications',
  // Auth group
  [COMMAND_GROUPS.AUTH]: 'Manage authentication and authorization',

  // Billing group
  [COMMAND_GROUPS.BILLING]: 'Manage billing and usage',
  // Chat group
  [COMMAND_GROUPS.CHAT]: 'Interact with AI chat models',
  // Clusters group
  [COMMAND_GROUPS.CLUSTERS]: 'Manage Kubernetes clusters',

  // Code group
  [COMMAND_GROUPS.CODE]: 'Configure Berget AI coding tools',
  // Flux group
  [COMMAND_GROUPS.FLUX]: 'Manage Flux CD',
  // Helm group
  [COMMAND_GROUPS.HELM]: 'Manage Helm charts',
  // Kubectl group
  [COMMAND_GROUPS.KUBECTL]: 'Manage Kubernetes resources',
  // Models group
  [COMMAND_GROUPS.MODELS]: 'Manage AI models',
  // Users group
  [COMMAND_GROUPS.USERS]: 'Manage users',
};
