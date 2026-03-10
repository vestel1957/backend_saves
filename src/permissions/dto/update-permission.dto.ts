import { IsString, MaxLength, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePermissionDto {
  @ApiPropertyOptional({ example: 'Permite ver la lista de usuarios' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
