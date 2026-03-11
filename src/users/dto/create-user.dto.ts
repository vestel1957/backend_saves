import { IsEmail, IsString, MaxLength, IsOptional, IsUUID, IsDateString, IsBooleanString, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'usuario@email.com' })
  @IsEmail({}, { message: 'El email debe ser válido' })
  email: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBooleanString()
  is_active?: string;

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

  @ApiPropertyOptional({ example: 'CC', description: 'Tipo de documento (CC, CE, NIT, etc.)' })
  @IsOptional()
  @IsString()
  document_type?: string;

  @ApiPropertyOptional({ example: '2024-01-15' })
  @IsOptional()
  @IsDateString({}, { message: 'La fecha debe estar en formato ISO' })
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

  @ApiPropertyOptional({ description: 'UUID del área' })
  @IsOptional()
  @IsUUID('4')
  @Transform(({ value }) => value || undefined) // 👈 agrega en area_id, sede_id y role_id
  area_id?: string;

  @ApiPropertyOptional({ description: 'Array de UUIDs de sedes', example: ['uuid1', 'uuid2'] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string') return [value];
    return undefined;
  })
  sede_ids?: string[];

  @ApiPropertyOptional({ description: 'UUID del rol a asignar' })
  @IsOptional()
  @IsUUID('4')
  @Transform(({ value }) => value || undefined)
  role_id?: string;
}
