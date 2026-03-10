import { IsString, MaxLength, IsOptional, IsUUID, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ example: 'Administrador' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Rol con acceso completo al sistema' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ description: 'UUID del rol padre' })
  @IsOptional()
  @IsUUID('4')
  parent_role_id?: string;

  @ApiPropertyOptional({ type: [String], description: 'Array de UUIDs de permisos a asignar' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  permission_ids?: string[];
}
