import apiClient from "./client";
import type { AuthTokens, User } from "./types";

export async function register(dto: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<AuthTokens> {
  const { data } = await apiClient.post<AuthTokens>("/auth/register", dto);
  return data;
}

export async function login(dto: {
  email: string;
  password: string;
}): Promise<AuthTokens> {
  const { data } = await apiClient.post<AuthTokens>("/auth/login", dto);
  return data;
}

export async function refresh(refreshToken: string): Promise<AuthTokens> {
  const { data } = await apiClient.post<AuthTokens>("/auth/refresh", {
    refreshToken,
  });
  return data;
}

export async function logout(refreshToken: string): Promise<void> {
  await apiClient.post("/auth/logout", { refreshToken });
}

export async function getMe(): Promise<User> {
  const { data } = await apiClient.get<User>("/auth/me");
  return data;
}

export function getGoogleLoginUrl(): string {
  return `${apiClient.defaults.baseURL}/auth/google`;
}

export function getTiktokLoginUrl(): string {
  return `${apiClient.defaults.baseURL}/auth/tiktok/login`;
}

// Note: baseURL already includes /v1, so these resolve to /v1/auth/google etc.
