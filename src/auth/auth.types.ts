export type Role = 'APP' | 'ROOT' | 'APP_ADMIN';

export type AppPrincipal = { role: 'APP'; applicationId: string; code: string };
export type UserPrincipal =
  | { role: 'ROOT'; userId: string; email: string }
  | { role: 'APP_ADMIN'; userId: string; email: string; applicationIds: string[] };

export type Principal = AppPrincipal | UserPrincipal;
