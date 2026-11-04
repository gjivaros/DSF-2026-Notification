import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL: string;

  @IsInt()
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  APP_URL: string;

  @IsString()
  @IsNotEmpty()
  SWAGGER_USER: string;

  @IsString()
  @IsNotEmpty()
  SWAGGER_PASSWORD: string;

  @Matches(/^[0-9a-f]{64}$/i, { message: 'OTP_ENCRYPTION_KEY must be 32 bytes in hex' })
  OTP_ENCRYPTION_KEY: string;

  @IsString()
  @IsNotEmpty()
  OPERATOR_SECRET_MTN: string;

  @IsString()
  @IsNotEmpty()
  OPERATOR_SECRET_MOOV: string;

  @IsString()
  @IsNotEmpty()
  OPERATOR_SECRET_CELTIIS: string;

  @IsInt()
  @Min(1)
  RATE_LIMIT_PER_SECOND: number = 100;

  @IsNumber()
  @Min(0)
  @Max(1)
  SIMULATOR_TEMPORARY_FAILURE_RATE: number = 0;

  @IsNumber()
  @Min(0)
  @Max(1)
  SIMULATOR_DEFINITIVE_FAILURE_RATE: number = 0;

  @IsNumber()
  @Min(0)
  @Max(1)
  SIMULATOR_OPERATOR_FAILURE_RATE: number = 0;

  @IsInt()
  @Min(0)
  SIMULATOR_DLR_DELAY_MS: number = 1000;

  @IsInt()
  @Min(1)
  SMS_RETRY_BASE_DELAY_MS: number = 2000;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const fields = errors.map((error) => error.property).join(', ');
    throw new Error(`Invalid environment variables: ${fields}`);
  }
  return validated;
}
