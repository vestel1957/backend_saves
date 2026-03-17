import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { BodyParserExceptionFilter } from './body-parser-exception.filter';

describe('BodyParserExceptionFilter', () => {
  let filter: BodyParserExceptionFilter;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new BodyParserExceptionFilter();
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => ({ status: mockStatus }),
        getRequest: () => ({ url: '/api/users', method: 'POST' }),
      }),
    } as unknown as ArgumentsHost;
  });

  describe('multipart payloads sent as JSON', () => {
    it('should rewrite error when message contains Unexpected token and WebK', () => {
      const exception = new BadRequestException(
        'Unexpected token \'-\', "------WebKit"... is not valid JSON',
      );

      filter.catch(exception, mockHost);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          error: 'Bad Request',
          message: expect.stringContaining('multipart'),
          path: '/api/users',
          method: 'POST',
        }),
      );
    });

    it('should detect multipart error from array message payload', () => {
      // BadRequestException with object payload where message is an array
      const exception = new BadRequestException({
        statusCode: 400,
        message: ['Unexpected token something', 'contains WebK boundary'],
        error: 'Bad Request',
      });

      filter.catch(exception, mockHost);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          error: 'Bad Request',
          path: '/api/users',
          method: 'POST',
          message: expect.stringContaining('multipart'),
        }),
      );
    });

    it('should detect multipart error from string message in object payload', () => {
      const exception = new BadRequestException({
        statusCode: 400,
        message: 'Unexpected token in WebKitFormBoundary',
        error: 'Bad Request',
      });

      filter.catch(exception, mockHost);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          error: 'Bad Request',
          message: expect.stringContaining('multipart'),
        }),
      );
    });
  });

  describe('non-multipart bad requests', () => {
    it('should pass through standard validation errors', () => {
      const payload = {
        statusCode: 400,
        message: ['email must be an email'],
        error: 'Bad Request',
      };
      const exception = new BadRequestException(payload);

      filter.catch(exception, mockHost);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: expect.arrayContaining(['email must be an email']),
        }),
      );
    });

    it('should pass through generic bad request with string message', () => {
      const payload = {
        statusCode: 400,
        message: 'Some other error',
        error: 'Bad Request',
      };
      const exception = new BadRequestException(payload);

      filter.catch(exception, mockHost);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(payload);
    });

    it('should pass through when only Unexpected token is present without WebK', () => {
      const exception = new BadRequestException({
        statusCode: 400,
        message: 'Unexpected token at position 0',
        error: 'Bad Request',
      });

      filter.catch(exception, mockHost);

      // Should NOT have the multipart rewrite
      expect(mockJson).toHaveBeenCalledWith(
        expect.not.objectContaining({
          path: '/api/users',
        }),
      );
    });

    it('should pass through when only WebK is present without Unexpected token', () => {
      const exception = new BadRequestException({
        statusCode: 400,
        message: 'Invalid WebKitFormBoundary',
        error: 'Bad Request',
      });

      filter.catch(exception, mockHost);

      expect(mockJson).toHaveBeenCalledWith(
        expect.not.objectContaining({
          path: '/api/users',
        }),
      );
    });
  });
});
