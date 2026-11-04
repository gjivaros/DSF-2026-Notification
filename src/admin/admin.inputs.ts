import { ApplicationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, MaxLength, Min } from 'class-validator';

export class AdminStatsQuery {
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class CreateApplicationInput {
  @Matches(/^[A-Z0-9_]{2,30}$/, { message: 'code must be 2 to 30 uppercase letters, digits or underscores' })
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  dailyQuota: number;

  @IsOptional()
  @IsUrl({ require_tld: false })
  webhookUrl?: string;
}

export class UpdateApplicationStatusInput {
  @IsEnum(ApplicationStatus)
  status: ApplicationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
