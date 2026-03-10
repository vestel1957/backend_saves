import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  // Body parser usando API de Nest, sin importar express directamente
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', {
    limit: '10mb',
    extended: true,
  });

  // Validación global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS desde variable de entorno
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3001'];

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  logger.log(`CORS habilitado para: ${corsOrigins.join(', ')}`);

  // Swagger / OpenAPI
  const config = new DocumentBuilder()
    .setTitle('Dashboard Ecommerce API')
    .setDescription(
      'API REST para gestión de usuarios, roles, permisos y autenticación multi-tenant',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addTag('Auth', 'Autenticación y sesiones')
    .addTag('Users', 'Gestión de usuarios')
    .addTag('Roles', 'Gestión de roles')
    .addTag('Permissions', 'Gestión de permisos')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');

  logger.log(`API corriendo en http://0.0.0.0:${port}`);
  logger.log(`Swagger docs en http://0.0.0.0:${port}/api/docs`);
}

bootstrap();