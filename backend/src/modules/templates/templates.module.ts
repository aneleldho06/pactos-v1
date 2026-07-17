import { Body, Controller, Get, Module, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../platform/prisma.module';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

const jsonValueSchema: z.ZodType<Prisma.JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

const templateSchema = z.object({
  slug: z.string().min(3),
  name: z.string().min(1),
  description: z.string(),
  category: z.string(),
  adl: z.record(jsonValueSchema).transform((value): Prisma.InputJsonObject => value),
  schema: z.record(jsonValueSchema).transform((value): Prisma.InputJsonObject => value),
});
@Controller('templates') class TemplatesController { constructor(private readonly prisma: PrismaService) {} @Get() list(@Query('category') category?: string) { return this.prisma.template.findMany({ where: { status: 'PUBLISHED', ...(category ? { category } : {}) }, orderBy: { name: 'asc' } }); } @Post() create(@Body(new ZodValidationPipe(templateSchema)) body: z.infer<typeof templateSchema>) { return this.prisma.template.create({ data: body }); } }
@Module({ controllers: [TemplatesController] }) export class TemplatesModule {}
