import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

function collectFields(errors: ValidationError[], parent = ''): string[] {
  return errors.flatMap((error) => {
    const path = parent ? `${parent}.${error.property}` : error.property;
    return error.children?.length ? collectFields(error.children, path) : [path];
  });
}

// Messages list the invalid fields only, so submitted values (OTP codes) never leak
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new BadRequestException(`Invalid or missing fields: ${collectFields(errors).join(', ')}`),
  });
}
