export type Role = 'APP' | 'ADMIN';

export type Principal =
  | { role: 'APP'; applicationId: string; code: string }
  | { role: 'ADMIN' };

export type AppPrincipal = Extract<Principal, { role: 'APP' }>;
