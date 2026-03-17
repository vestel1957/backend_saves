import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { JsonLoggerService } from './common/logger/json-logger.service';
import { validateEnv } from './common/config/env.validation';

async function bootstrap() {
  // Validar variables de entorno antes de arrancar
  validateEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new JsonLoggerService(),
  });
  const logger = new Logger('Bootstrap');

  // WebSocket adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  // Security headers (X-Content-Type-Options, X-Frame-Options, HSTS, etc.)
  app.use(helmet());

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

  // Filtro global que estandariza TODAS las respuestas de error
  app.useGlobalFilters(new AllExceptionsFilter());

  // ─── CORS ─────────────────────────────────────────────
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : [];

  // IPs permitidas con cualquier puerto (ej: "10.0.0.1,192.168.1.1")
  const allowedIpPatterns = (process.env.ALLOWED_IPS || '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean)
    .map((ip) => new RegExp(`^https?:\\/\\/${ip.replace(/\./g, '\\.')}(:\\d+)?$`));

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      const isAllowedByEnv = corsOrigins.includes(origin);
      const isAllowedByIp = allowedIpPatterns.some((re) => re.test(origin));

      if (isAllowedByEnv || isAllowedByIp) {
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

  // Swagger solo disponible fuera de produccion
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Dashboard Admin API')
      .setDescription(
        'API REST para gestion de usuarios, roles, permisos y autenticacion',
      )
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .addTag('Auth', 'Autenticacion y sesiones')
      .addTag('Users', 'Gestion de usuarios')
      .addTag('Roles', 'Gestion de roles')
      .addTag('Permissions', 'Gestion de permisos')
      .addTag('Audit', 'Logs de auditoria')
      .addTag('Health', 'Estado del servicio')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
    logger.log('Swagger docs habilitado en /api/docs');
  }

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');

  logger.log(`API corriendo en http://0.0.0.0:${port}`);
}

bootstrap();
