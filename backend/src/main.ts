import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({ origin: process.env.CORS_ORIGINS?.split(',') ?? false, credentials: true });
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('PactOS API').setVersion('v1').addBearerAuth().build());
  SwaggerModule.setup('docs', app, document);
  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
