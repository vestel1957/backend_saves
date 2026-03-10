import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignRolePermissionsDto {
  @ApiProperty({ type: [String], description: 'Array de UUIDs de permisos' })
  @IsArray()
  @IsUUID('4', { each: true })
  permission_ids: string[];
}
