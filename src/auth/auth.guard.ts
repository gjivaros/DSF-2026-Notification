import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Errors } from '../common/errors';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators';
import { AuthService } from './auth.service';
import { Role } from './auth.types';

// RBAC: every route requires a principal unless @Public; @Roles restricts which ones
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest();
    const principal = await this.authService.resolvePrincipal(request.headers);
    if (!principal) throw Errors.invalidCredentials();
    request.principal = principal;

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (roles?.length && !roles.includes(principal.role)) throw Errors.forbidden();
    return true;
  }
}
