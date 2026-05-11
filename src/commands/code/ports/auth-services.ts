export interface ApiKeyServicePort {
  create(options: { description?: string; name: string }): Promise<{ key: string }>;
}

export interface AuthServicePort {
  login(): Promise<boolean>;
  loginInteractive(): Promise<{
    accessToken?: string;
    error?: string;
    expiresIn?: number;
    refreshToken?: string;
    success: boolean;
  }>;
}
