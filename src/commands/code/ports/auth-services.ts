export interface AuthServicePort {
  login(): Promise<boolean>;
  loginInteractive(): Promise<{
    success: boolean;
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    error?: string;
  }>;
}

export interface ApiKeyServicePort {
  create(options: { name: string; description?: string }): Promise<{ key: string }>;
}
