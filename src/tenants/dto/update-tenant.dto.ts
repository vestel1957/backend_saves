import { IsString, IsOptional, IsEmail, IsInt, Min, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTenantDto {
  @ApiPropertyOptional({ example: 'Mi Empresa Actualizada' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'miempresa.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;

  @ApiPropertyOptional({ example: 'contacto@miempresa.com' })
  @IsOptional()
  @IsEmail()
  contact_email?: string;

  @ApiPropertyOptional({ example: '+57 300 123 4567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  contact_phone?: string;

  @ApiPropertyOptional({ example: 'Calle 123 #45-67' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'professional' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  plan?: string;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  max_users?: number;
}
