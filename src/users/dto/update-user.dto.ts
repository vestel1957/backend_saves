import { IsString, MaxLength, IsOptional, IsUUID, IsDateString, IsBooleanString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Juan' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  first_name?: string;

  @ApiPropertyOptional({ example: 'Pérez' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  last_name?: string;

  @ApiPropertyOptional({ example: '1234567890' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  document_number?: string;

  @ApiPropertyOptional({ example: 'CC' })
  @IsOptional()
  @IsString()
  document_type?: string;

  @ApiPropertyOptional({ example: '2024-01-15' })
  @IsOptional()
  @IsDateString()
  hire_date?: string;

  @ApiPropertyOptional({ example: 'O+' })
  @IsOptional()
  @IsString()
  blood_type?: string;

  @ApiPropertyOptional({ example: 'Sura' })
  @IsOptional()
  @IsString()
  eps?: string;

  @ApiPropertyOptional({ example: 'Porvenir' })
  @IsOptional()
  @IsString()
  pension_fund?: string;

  @ApiPropertyOptional({ example: 'Calle 123 #45-67' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Bogotá' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Cundinamarca' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ example: 'Colombia' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: '3001234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone_alt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  area_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  sede_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBooleanString()
  is_active?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  role_id?: string;
}
