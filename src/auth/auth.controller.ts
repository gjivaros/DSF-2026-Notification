import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CurrentPrincipal, Public, Roles } from './auth.decorators';
import { LoginInput } from './auth.inputs';
import { AuthService } from './auth.service';
import { UserPrincipal } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() input: LoginInput) {
    return this.authService.login(input);
  }

  @Roles('ROOT', 'APP_ADMIN')
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Headers() headers: Record<string, string>) {
    await this.authService.logout(headers);
  }

  @Roles('ROOT', 'APP_ADMIN')
  @Get('me')
  me(@CurrentPrincipal() principal: UserPrincipal) {
    return this.authService.me(principal.userId);
  }
}
