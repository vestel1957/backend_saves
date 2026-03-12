import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { JsonLoggerService } from './common/logger/json-logger.service';
import { validateEnv } from './common/config/env.validation';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  // Validar variables de entorno antes de arrancar
  validateEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new JsonLoggerService(),
  });
  const logger = new Logger('Bootstrap');

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

  // ─── CORS dinámico (env + tenant domains) ─────────────
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : [];

  const prisma = app.get(PrismaService);
  let cachedTenantDomains: string[] = [];
  let domainsCacheTime = 0;
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  async function getTenantDomains(): Promise<string[]> {
    if (Date.now() - domainsCacheTime < CACHE_TTL) {
      return cachedTenantDomains;
    }
    try {
      const tenants = await prisma.tenants.findMany({
        where: { is_active: true, domain: { not: null } },
        select: { domain: true },
      });
      cachedTenantDomains = tenants
        .map((t) => t.domain!)
        .filter(Boolean);
      domainsCacheTime = Date.now();
    } catch {
      // Si falla la BD, usar la cache anterior
    }
    return cachedTenantDomains;
  }

  app.enableCors({
    origin: async (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      const isAllowedByEnv = corsOrigins.includes(origin);
      const isAllowedIpAnyPort = /^http:\/\/190\.14\.233\.186:\d+$/.test(origin);

      if (isAllowedByEnv || isAllowedIpAnyPort) {
        return callback(null, true);
      }

      // Verificar dominios de tenants activos
      const tenantDomains = await getTenantDomains();
      const originHost = origin.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
      if (tenantDomains.some((d) => d === origin || d === originHost)) {
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

  // Swagger solo disponible fuera de producción
  if (process.env.NODE_ENV !== 'production') {
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
      .addTag('Tenants', 'Gestión de organizaciones')
      .addTag('Audit', 'Logs de auditoría')
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
