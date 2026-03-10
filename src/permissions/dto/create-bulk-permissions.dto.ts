import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CreatePermissionDto } from './create-permission.dto';

export class CreateBulkPermissionsDto {
  @ApiProperty({ type: [CreatePermissionDto], description: 'Array de permisos a crear' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePermissionDto)
  permissions: CreatePermissionDto[];
}
