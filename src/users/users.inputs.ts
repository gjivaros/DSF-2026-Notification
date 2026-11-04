import { UserStatus } from '@prisma/client';
import { ArrayUnique, IsArray, IsEmail, IsEnum, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateUserInput {
  @IsEmail()
  email: string;

  // Initial password, given to the user by the root admin
  @IsString()
  @MinLength(8)
  password: string;

  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  applicationIds: string[];
}

export class SetUserApplicationsInput {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  applicationIds: string[];
}

export class UpdateUserStatusInput {
  @IsEnum(UserStatus)
  status: UserStatus;
}
