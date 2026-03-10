import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { BodyParserExceptionFilter } from './common/filters/body-parser-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', {
    limit: '10mb',
    extended: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new BodyParserExceptionFilter());

  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : [];

  app.enableCors({
    origin: (origin, callback) => {
      logger.log(`Origin recibido: ${origin}`);

      if (!origin) {
        return callback(null, true);
      }

      const isAllowedByEnv = corsOrigins.includes(origin);
      const isAllowedIpAnyPort = /^http:\/\/190\.14\.233\.186:\d+$/.test(origin);

      if (isAllowedByEnv || isAllowedIpAnyPort) {
        return callback(null, true);
      }

      logger.error(`Origin no permitido por CORS: ${origin}`);
      return callback(new Error(`Origin no permitido por CORS: ${origin}`), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
    optionsSuccessStatus: 204,
  });

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