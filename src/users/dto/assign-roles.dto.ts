import { IsArray, IsUUID, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignRolesDto {
  @ApiProperty({ type: [String], description: 'Array de UUIDs de roles' })
  @IsArray()
  @IsUUID('4', { each: true })
  role_ids: string[];

  @ApiPropertyOptional({ example: '2025-12-31T23:59:59Z', description: 'Fecha de expiración' })
  @IsOptional()
  @IsDateString()
  expires_at?: string;
}
