import { LoggerService, ConsoleLogger } from '@nestjs/common';

export class JsonLoggerService extends ConsoleLogger implements LoggerService {
  private readonly isProduction = process.env.NODE_ENV === 'production';

  log(message: any, context?: string) {
    if (this.isProduction) {
      this.printJson('log', message, context);
    } else {
      super.log(message, context);
    }
  }

  error(message: any, stack?: string, context?: string) {
    if (this.isProduction) {
      this.printJson('error', message, context, stack);
    } else {
      super.error(message, stack, context);
    }
  }

  warn(message: any, context?: string) {
    if (this.isProduction) {
      this.printJson('warn', message, context);
    } else {
      super.warn(message, context);
    }
  }

  debug(message: any, context?: string) {
    if (this.isProduction) {
      this.printJson('debug', message, context);
    } else {
      super.debug(message, context);
    }
  }

  verbose(message: any, context?: string) {
    if (this.isProduction) {
      this.printJson('verbose', message, context);
    } else {
      super.verbose(message, context);
    }
  }

  private printJson(level: string, message: any, context?: string, stack?: string) {
    const entry: Record<string, any> = {
      timestamp: new Date().toISOString(),
      level,
      context: context || 'Application',
      message: typeof message === 'string' ? message : JSON.stringify(message),
    };

    if (stack) {
      entry.stack = stack;
    }

    process.stdout.write(JSON.stringify(entry) + '\n');
  }
}
