import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;
  let appService: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: {
            getHello: jest.fn().mockReturnValue('Hello World!'),
          },
        },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
    appService = module.get<AppService>(AppService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getHello', () => {
    it('should return "Hello World!"', () => {
      const result = controller.getHello();

      expect(result).toBe('Hello World!');
      expect(appService.getHello).toHaveBeenCalled();
    });

    it('should delegate to AppService', () => {
      (appService.getHello as jest.Mock).mockReturnValue('Custom greeting');

      const result = controller.getHello();

      expect(result).toBe('Custom greeting');
    });
  });
});
