import { ArrayMinSize, ArrayUnique, IsArray, IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQuery } from '../sms/sms.inputs';

export class CreateCampaignInput {
  // The 500 limit is checked by the service to return TOO_MANY_RECIPIENTS
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  recipients: string[];

  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  scheduledAt?: string;
}

export class ListCampaignsQuery extends PaginationQuery {}
