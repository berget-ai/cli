/**
 * Command structure constants for the CLI
 * Following patterns from AWS CLI and Google Cloud CLI
 */

// Main command groups
export const COMMAND_GROUPS = {
  AUTH: 'auth',
  API_KEYS: 'api-keys',
  CLUSTERS: 'clusters',
  APPS: 'apps',
  MODELS: 'models',
  HELM: 'helm',
  KUBECTL: 'kubectl',
  FLUX: 'flux',
  USERS: 'users',
  BILLING: 'billing',
  CHAT: 'chat',
}

// Subcommands for each group
export const SUBCOMMANDS = {
  // Auth commands
  AUTH: {
    LOGIN: 'login',
    LOGOUT: 'logout',
    WHOAMI: 'whoami',
  },
  
  // Chat commands
  CHAT: {
    RUN: 'run',
    LIST: 'list',
  },
  
  // API Keys commands
  API_KEYS: {
    LIST: 'list',
    CREATE: 'create',
    DELETE: 'delete',
    ROTATE: 'rotate',
    DESCRIBE: 'describe',
  },
  
  // Clusters commands
  CLUSTERS: {
    LIST: 'list',
    DESCRIBE: 'describe',
    GET_USAGE: 'get-usage',
  },
  
  // Apps commands
  APPS: {
    LIST_TEMPLATES: 'list-templates',
    DESCRIBE_TEMPLATE: 'describe-template',
    LIST_INSTALLATIONS: 'list-installations',
    INSTALL: 'install',
    UNINSTALL: 'uninstall',
    DESCRIBE_INSTALLATION: 'describe-installation',
  },
  
  // Models commands
  MODELS: {
    LIST: 'list',
    DESCRIBE: 'describe',
  },
  
  // Helm commands
  HELM: {
    ADD_REPO: 'add-repo',
    INSTALL: 'install',
  },
  
  // Kubectl commands
  KUBECTL: {
    CREATE_NAMESPACE: 'create-namespace',
    APPLY: 'apply',
    GET: 'get',
  },
  
  // Flux commands
  FLUX: {
    INSTALL: 'install',
    BOOTSTRAP: 'bootstrap',
  },
  
  // Users commands
  USERS: {
    LIST: 'list',
    DESCRIBE: 'describe',
    UPDATE: 'update',
    INVITE: 'invite',
  },
  
  // Billing commands
  BILLING: {
    GET_USAGE: 'get-usage',
    LIST_INVOICES: 'list-invoices',
    DESCRIBE_INVOICE: 'describe-invoice',
    LIST_PAYMENT_METHODS: 'list-payment-methods',
    ADD_PAYMENT_METHOD: 'add-payment-method',
    REMOVE_PAYMENT_METHOD: 'remove-payment-method',
    UPDATE_SUBSCRIPTION: 'update-subscription',
  },
}

// Command descriptions
export const COMMAND_DESCRIPTIONS = {
  // Auth group
  [COMMAND_GROUPS.AUTH]: 'Manage authentication and authorization',
  [`${COMMAND_GROUPS.AUTH} ${SUBCOMMANDS.AUTH.LOGIN}`]: 'Log in to Berget AI',
  [`${COMMAND_GROUPS.AUTH} ${SUBCOMMANDS.AUTH.LOGOUT}`]: 'Log out from Berget AI',
  [`${COMMAND_GROUPS.AUTH} ${SUBCOMMANDS.AUTH.WHOAMI}`]: 'Display current user information',
  
  // API Keys group
  [COMMAND_GROUPS.API_KEYS]: 'Manage API keys',
  [`${COMMAND_GROUPS.API_KEYS} ${SUBCOMMANDS.API_KEYS.LIST}`]: 'List all API keys',
  [`${COMMAND_GROUPS.API_KEYS} ${SUBCOMMANDS.API_KEYS.CREATE}`]: 'Create a new API key',
  [`${COMMAND_GROUPS.API_KEYS} ${SUBCOMMANDS.API_KEYS.DELETE}`]: 'Delete an API key',
  [`${COMMAND_GROUPS.API_KEYS} ${SUBCOMMANDS.API_KEYS.ROTATE}`]: 'Rotate an API key',
  [`${COMMAND_GROUPS.API_KEYS} ${SUBCOMMANDS.API_KEYS.DESCRIBE}`]: 'Get usage statistics for an API key',
  
  // Clusters group
  [COMMAND_GROUPS.CLUSTERS]: 'Manage Kubernetes clusters',
  [`${COMMAND_GROUPS.CLUSTERS} ${SUBCOMMANDS.CLUSTERS.LIST}`]: 'List all clusters',
  [`${COMMAND_GROUPS.CLUSTERS} ${SUBCOMMANDS.CLUSTERS.DESCRIBE}`]: 'Get detailed information about a cluster',
  [`${COMMAND_GROUPS.CLUSTERS} ${SUBCOMMANDS.CLUSTERS.GET_USAGE}`]: 'Get resource usage for a cluster',
  
  // Apps group
  [COMMAND_GROUPS.APPS]: 'Manage applications',
  [`${COMMAND_GROUPS.APPS} ${SUBCOMMANDS.APPS.LIST_TEMPLATES}`]: 'List available application templates',
  [`${COMMAND_GROUPS.APPS} ${SUBCOMMANDS.APPS.DESCRIBE_TEMPLATE}`]: 'Get detailed information about an application template',
  [`${COMMAND_GROUPS.APPS} ${SUBCOMMANDS.APPS.LIST_INSTALLATIONS}`]: 'List installed applications',
  [`${COMMAND_GROUPS.APPS} ${SUBCOMMANDS.APPS.INSTALL}`]: 'Install an application',
  [`${COMMAND_GROUPS.APPS} ${SUBCOMMANDS.APPS.UNINSTALL}`]: 'Uninstall an application',
  [`${COMMAND_GROUPS.APPS} ${SUBCOMMANDS.APPS.DESCRIBE_INSTALLATION}`]: 'Get detailed information about an installed application',
  
  // Models group
  [COMMAND_GROUPS.MODELS]: 'Manage AI models',
  [`${COMMAND_GROUPS.MODELS} ${SUBCOMMANDS.MODELS.LIST}`]: 'List available AI models',
  [`${COMMAND_GROUPS.MODELS} ${SUBCOMMANDS.MODELS.DESCRIBE}`]: 'Get detailed information about an AI model',
  
  // Helm group
  [COMMAND_GROUPS.HELM]: 'Manage Helm charts',
  [`${COMMAND_GROUPS.HELM} ${SUBCOMMANDS.HELM.ADD_REPO}`]: 'Add a Helm repository',
  [`${COMMAND_GROUPS.HELM} ${SUBCOMMANDS.HELM.INSTALL}`]: 'Install a Helm chart',
  
  // Kubectl group
  [COMMAND_GROUPS.KUBECTL]: 'Manage Kubernetes resources',
  [`${COMMAND_GROUPS.KUBECTL} ${SUBCOMMANDS.KUBECTL.CREATE_NAMESPACE}`]: 'Create a Kubernetes namespace',
  [`${COMMAND_GROUPS.KUBECTL} ${SUBCOMMANDS.KUBECTL.APPLY}`]: 'Apply a Kubernetes configuration',
  [`${COMMAND_GROUPS.KUBECTL} ${SUBCOMMANDS.KUBECTL.GET}`]: 'Get Kubernetes resources',
  
  // Flux group
  [COMMAND_GROUPS.FLUX]: 'Manage Flux CD',
  [`${COMMAND_GROUPS.FLUX} ${SUBCOMMANDS.FLUX.INSTALL}`]: 'Install Flux CD',
  [`${COMMAND_GROUPS.FLUX} ${SUBCOMMANDS.FLUX.BOOTSTRAP}`]: 'Bootstrap Flux CD',
  
  // Users group
  [COMMAND_GROUPS.USERS]: 'Manage users',
  [`${COMMAND_GROUPS.USERS} ${SUBCOMMANDS.USERS.LIST}`]: 'List all users in your organization',
  [`${COMMAND_GROUPS.USERS} ${SUBCOMMANDS.USERS.DESCRIBE}`]: 'Get detailed information about a user',
  [`${COMMAND_GROUPS.USERS} ${SUBCOMMANDS.USERS.UPDATE}`]: 'Update user information',
  [`${COMMAND_GROUPS.USERS} ${SUBCOMMANDS.USERS.INVITE}`]: 'Invite a new user to your organization',
  
  // Billing group
  [COMMAND_GROUPS.BILLING]: 'Manage billing and usage',
  [`${COMMAND_GROUPS.BILLING} ${SUBCOMMANDS.BILLING.GET_USAGE}`]: 'Get current usage metrics',
  [`${COMMAND_GROUPS.BILLING} ${SUBCOMMANDS.BILLING.LIST_INVOICES}`]: 'List all invoices',
  [`${COMMAND_GROUPS.BILLING} ${SUBCOMMANDS.BILLING.DESCRIBE_INVOICE}`]: 'Get detailed information about an invoice',
  [`${COMMAND_GROUPS.BILLING} ${SUBCOMMANDS.BILLING.LIST_PAYMENT_METHODS}`]: 'List all payment methods',
  [`${COMMAND_GROUPS.BILLING} ${SUBCOMMANDS.BILLING.ADD_PAYMENT_METHOD}`]: 'Add a new payment method',
  [`${COMMAND_GROUPS.BILLING} ${SUBCOMMANDS.BILLING.REMOVE_PAYMENT_METHOD}`]: 'Remove a payment method',
  [`${COMMAND_GROUPS.BILLING} ${SUBCOMMANDS.BILLING.UPDATE_SUBSCRIPTION}`]: 'Update subscription plan',
  
  // Chat group
  [COMMAND_GROUPS.CHAT]: 'Interact with AI chat models',
  [`${COMMAND_GROUPS.CHAT} ${SUBCOMMANDS.CHAT.RUN}`]: 'Run a chat session with a specified model',
  [`${COMMAND_GROUPS.CHAT} ${SUBCOMMANDS.CHAT.LIST}`]: 'List available chat models',
}
