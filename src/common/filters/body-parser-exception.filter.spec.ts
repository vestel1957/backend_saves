import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { BodyParserExceptionFilter } from './body-parser-exception.filter';

describe('BodyParserExceptionFilter', () => {
  it('rewrites multipart payloads mislabeled as JSON', () => {
    const filter = new BodyParserExceptionFilter();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/v1/users', method: 'POST' }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(
      new BadRequestException('Unexpected token \'-\', "------WebKit"... is not valid JSON'),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: 'Bad Request',
        path: '/api/v1/users',
        method: 'POST',
      }),
    );
  });

  it('passes through unrelated bad requests', () => {
    const filter = new BodyParserExceptionFilter();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const payload = { statusCode: 400, message: 'validation error', error: 'Bad Request' };
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/v1/users', method: 'POST' }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new BadRequestException(payload), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(payload);
  });
});
