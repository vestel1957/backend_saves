import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token obtenido en login' })
  @IsString({ message: 'El refresh_token es requerido' })
  refresh_token: string;
}
