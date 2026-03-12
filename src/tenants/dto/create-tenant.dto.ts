import { IsString, IsOptional, IsEmail, IsInt, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTenantDto {
  @ApiProperty({ example: 'Mi Empresa' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'admin@miempresa.com', description: 'Email del administrador inicial' })
  @IsEmail({}, { message: 'El email del admin debe ser válido' })
  admin_email: string;

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

  @ApiPropertyOptional({ example: 'professional', default: 'basic' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  plan?: string;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  max_users?: number;
}
