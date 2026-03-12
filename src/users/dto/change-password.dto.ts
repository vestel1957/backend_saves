import { IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ example: 'NuevaPassword123!' })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(100)
  @Matches(/(?=.*[a-z])/, { message: 'La contraseña debe contener al menos una letra minúscula' })
  @Matches(/(?=.*[A-Z])/, { message: 'La contraseña debe contener al menos una letra mayúscula' })
  @Matches(/(?=.*\d)/, { message: 'La contraseña debe contener al menos un número' })
  @Matches(/(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/, { message: 'La contraseña debe contener al menos un carácter especial' })
  new_password: string;
}
