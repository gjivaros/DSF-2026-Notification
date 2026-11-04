import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { AdminStatsQuery } from './admin.inputs';
import { AdminService } from './admin.service';

@Controller('admin')
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  stats(@Query() query: AdminStatsQuery) {
    return this.adminService.stats(query);
  }

  @Get('applications')
  applications() {
    return this.adminService.applications();
  }
}
