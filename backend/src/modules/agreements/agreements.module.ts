import { Body, Controller, Get, Module, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AgreementsService } from './agreements.service';
const createSchema = z.object({ chainAgreementId: z.string().min(1), creatorId: z.string().min(1), contractId: z.string().min(1), assetAddress: z.string().min(1), metadataHash: z.string().length(64), ruleHash: z.string().length(64), participants: z.array(z.object({ walletAddress: z.string(), role: z.string(), shareBps: z.number().int().min(0).max(10_000).optional() })).min(1) });
@Controller('agreements') class AgreementsController { constructor(private readonly agreements: AgreementsService) {} @Post() create(@Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>) { return this.agreements.create(body); } @Get() list(@Query('cursor') cursor?: string, @Query('status') status?: string) { return this.agreements.list(cursor, status); } @Get(':id') get(@Param('id') id: string) { return this.agreements.get(id); } }
@Module({ controllers: [AgreementsController], providers: [AgreementsService], exports: [AgreementsService] }) export class AgreementsModule {}
