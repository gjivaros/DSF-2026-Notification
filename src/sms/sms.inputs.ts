import { SmsCategory, SmsStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSmsInput {
  // Format and operator are checked by the service to return dedicated error codes
  @IsString()
  to: string;

  @IsString()
  @IsNotEmpty()
  text: string;

  @IsEnum(SmsCategory)
  category: SmsCategory;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  scheduledAt?: string;
}

export class PaginationQuery {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class ListSmsQuery extends PaginationQuery {
  @IsOptional()
  @IsEnum(SmsStatus)
  status?: SmsStatus;

  @IsOptional()
  @IsEnum(SmsCategory)
  category?: SmsCategory;

  @IsOptional()
  @IsUUID()
  campaignId?: string;
}
