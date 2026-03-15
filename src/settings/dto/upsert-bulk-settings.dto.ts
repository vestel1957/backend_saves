import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { UpsertSettingDto } from './upsert-setting.dto';

export class UpsertBulkSettingsDto {
  @ApiProperty({ type: [UpsertSettingDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertSettingDto)
  settings: UpsertSettingDto[];
}
