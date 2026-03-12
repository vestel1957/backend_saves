import { IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiProperty({ example: { theme: 'dark', language: 'es' }, description: 'Objeto JSON con configuraciones' })
  @IsObject({ message: 'settings debe ser un objeto JSON válido' })
  settings: Record<string, any>;
}
