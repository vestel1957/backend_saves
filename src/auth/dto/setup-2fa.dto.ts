import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class Verify2faDto {
  @ApiProperty({ example: '123456', description: 'Codigo TOTP de 6 digitos' })
  @IsString()
  @Length(6, 6, { message: 'El codigo debe tener exactamente 6 digitos' })
  code: string;
}
