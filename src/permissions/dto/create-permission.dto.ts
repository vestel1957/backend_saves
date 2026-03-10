import { IsString, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePermissionDto {
  @ApiProperty({ example: 'configuracion', description: 'Nombre del módulo' })
  @IsString()
  @MaxLength(100)
  module: string;

  @ApiProperty({ example: 'usuarios', description: 'Nombre del submódulo' })
  @IsString()
  @MaxLength(100)
  submodule: string;

  @ApiProperty({ example: 'ver', description: 'Acción (ver, crear, editar, eliminar)' })
  @IsString()
  @MaxLength(100)
  action: string;

  @ApiPropertyOptional({ example: 'Permite ver la lista de usuarios' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
