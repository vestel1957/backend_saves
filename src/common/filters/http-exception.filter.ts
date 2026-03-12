import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Error interno del servidor';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, any>;
        message = obj.message || exception.message;
        error = obj.error || this.getErrorName(statusCode);

        // Detectar error de multipart enviado como JSON
        if (statusCode === HttpStatus.BAD_REQUEST && this.isMultipartJsonError(obj)) {
          message = 'Se detectó un body multipart enviado como JSON. Si usas FormData, no envíes el header Content-Type manualmente.';
        }
      }
    } else if (this.isPrismaError(exception)) {
      const prismaResult = this.handlePrismaError(exception as any);
      statusCode = prismaResult.statusCode;
      message = prismaResult.message;
      error = prismaResult.error;
    } else if (exception instanceof Error) {
      message = process.env.NODE_ENV === 'production'
        ? 'Error interno del servidor'
        : exception.message;
    }

    // Log errores 5xx con stack trace
    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(statusCode).json({
      statusCode,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private getErrorName(statusCode: number): string {
    const names: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
    };
    return names[statusCode] || 'Error';
  }

  private isPrismaError(exception: unknown): boolean {
    return (
      exception !== null &&
      typeof exception === 'object' &&
      'code' in exception &&
      typeof (exception as any).code === 'string' &&
      (exception as any).code.startsWith('P')
    );
  }

  private handlePrismaError(exception: { code: string; meta?: any }): {
    statusCode: number;
    message: string;
    error: string;
  } {
    switch (exception.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: `Ya existe un registro con ese valor único: ${(exception.meta?.target as string[])?.join(', ') || 'campo desconocido'}`,
          error: 'Conflict',
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Registro no encontrado',
          error: 'Not Found',
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Referencia a un registro que no existe',
          error: 'Bad Request',
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Error de base de datos',
          error: 'Internal Server Error',
        };
    }
  }

  private isMultipartJsonError(payload: Record<string, any>): boolean {
    const msg = Array.isArray(payload.message)
      ? payload.message.join(' ')
      : String(payload.message ?? '');
    return msg.includes('Unexpected token') && msg.includes('WebK');
  }
}
