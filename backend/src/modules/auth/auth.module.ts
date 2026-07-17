import { Body, Controller, Module, Post } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuthService } from './auth.service';
const challengeSchema = z.object({ walletAddress: z.string().regex(/^G[A-Z2-7]{55}$/) });
const verifySchema = challengeSchema.extend({ nonce: z.string().uuid(), signature: z.string().min(1) });
@Controller('auth') class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('challenge') challenge(@Body(new ZodValidationPipe(challengeSchema)) body: z.infer<typeof challengeSchema>) { return this.auth.challenge(body.walletAddress); }
  @Post('verify') verify(@Body(new ZodValidationPipe(verifySchema)) body: z.infer<typeof verifySchema>) { return this.auth.verify(body); }
}
@Module({ imports: [JwtModule.register({})], controllers: [AuthController], providers: [AuthService] }) export class AuthModule {}
