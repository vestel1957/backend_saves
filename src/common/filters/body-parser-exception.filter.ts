import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(BadRequestException)
export class BodyParserExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const payload = exception.getResponse();

    if (!this.isInvalidJsonMultipartError(payload)) {
      response.status(status).json(payload);
      return;
    }

    response.status(status).json({
      statusCode: status,
      error: 'Bad Request',
      message: 'Se detecto un body multipart enviado como JSON. Si usas FormData, no envies el header Content-Type manualmente; deja que el cliente envie multipart/form-data con boundary.',
      path: request.url,
      method: request.method,
    });
  }

  private isInvalidJsonMultipartError(payload: string | object): boolean {
    if (typeof payload === 'string') {
      return payload.includes('Unexpected token') && payload.includes('WebK');
    }

    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const message = (payload as { message?: unknown }).message;
    const normalized = Array.isArray(message) ? message.join(' ') : String(message ?? '');

    return normalized.includes('Unexpected token') && normalized.includes('WebK');
  }
}
