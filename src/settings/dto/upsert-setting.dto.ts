import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertSettingDto {
  @ApiProperty({ example: 'company_name' })
  @IsString()
  @MaxLength(100)
  key: string;

  @ApiProperty({ example: 'Mi Empresa S.A.S' })
  @IsString()
  value: string;

  @ApiPropertyOptional({ example: 'general' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  group?: string;

  @ApiPropertyOptional({ example: 'string', enum: ['string', 'number', 'boolean', 'json'] })
  @IsOptional()
  @IsString()
  type?: string;
}
