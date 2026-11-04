import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { Errors } from '../common/errors';
import { CreateUserInput, SetUserApplicationsInput, UpdateUserStatusInput } from './users.inputs';
import { UsersService } from './users.service';

const userIdPipe = new ParseUUIDPipe({ exceptionFactory: () => Errors.userNotFound() });

@Controller('admin/users')
@Roles('ROOT')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list() {
    return this.usersService.list();
  }

  @Post()
  create(@Body() input: CreateUserInput) {
    return this.usersService.create(input);
  }

  @Put(':userId/applications')
  setApplications(@Param('userId', userIdPipe) userId: string, @Body() input: SetUserApplicationsInput) {
    return this.usersService.setApplications(userId, input);
  }

  @Patch(':userId/status')
  updateStatus(@Param('userId', userIdPipe) userId: string, @Body() input: UpdateUserStatusInput) {
    return this.usersService.updateStatus(userId, input);
  }
}
