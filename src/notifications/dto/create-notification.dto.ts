import { IsString, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateNotificationDto {
  @ApiProperty({ description: 'ID del usuario destinatario' })
  @IsUUID()
  user_id: string;

  @ApiProperty({ example: 'Nuevo usuario creado' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Se ha creado el usuario juan@email.com' })
  @IsString()
  @MaxLength(500)
  message: string;

  @ApiPropertyOptional({ example: 'info', enum: ['info', 'success', 'warning', 'error'] })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: '/users/123' })
  @IsOptional()
  @IsString()
  link?: string;
}
