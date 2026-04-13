import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { ContentStatus, PostFormat } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiServiceClient } from '../ai-service/ai-service.client';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';

const CONTENT_STATUSES = [
  'draft',
  'approved',
  'needs_revision',
  'flagged_for_review',
  'published',
] as const;

class UpdateStatusDto {
  @ApiProperty({
    enum: CONTENT_STATUSES,
    description: 'New workflow status for the content post.',
    example: 'approved',
  })
  @IsString()
  @IsIn(CONTENT_STATUSES as unknown as string[])
  status!: (typeof CONTENT_STATUSES)[number];
}

@ApiTags('Posts')
@ApiBearerAuth('access-token')
@Controller('posts')
export class PostsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiServiceClient,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List content posts for the current user',
    description:
      'Returns a paginated list of AI-generated posts owned by the caller. Filter by scan run, target format, or workflow status.',
  })
  @ApiQuery({ name: 'scanRunId', required: false, description: 'Filter to posts generated from a specific scan run.' })
  @ApiQuery({ name: 'format', required: false, description: 'Target format (e.g. `linkedin`, `tiktok`).' })
  @ApiQuery({ name: 'status', required: false, enum: CONTENT_STATUSES })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20, description: 'Page size (1–100).' })
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('scanRunId') scanRunId?: string,
    @Query('format') format?: string,
    @Query('status') status?: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
  ) {
    const page = Math.max(parseInt(pageStr, 10) || 1, 1);
    const pageSize = Math.min(
      Math.max(parseInt(pageSizeStr, 10) || 20, 1),
      100,
    );
    const where = {
      createdBy: user.userId,
      ...(scanRunId && { scanRunId }),
      ...(format && { format: format as PostFormat }),
      ...(status && { status: status as ContentStatus }),
    };
    const [items, total] = await Promise.all([
      this.prisma.contentPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.contentPost.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a content post by ID',
    description: 'Returns a single post if it belongs to the current user.',
  })
  @ApiParam({ name: 'id', description: 'Content post ID (UUID).' })
  async detail(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const row = await this.prisma.contentPost.findFirst({
      where: { id, createdBy: user.userId },
    });
    if (!row) throw new NotFoundException('Post not found');
    return row;
  }

  @Post('generate')
  @ApiOperation({
    summary: 'Generate content posts from a trend or scan run',
    description:
      'Proxies to the FastAPI ai-service which runs the LangGraph post-generator pipeline. The request body is forwarded as-is; see ai-service `/api/v1/posts/generate` for the full contract.',
  })
  @ApiBody({
    description: 'Post-generator input (passthrough to ai-service).',
    schema: {
      type: 'object',
      additionalProperties: true,
      example: {
        scanRunId: '01J...',
        trendItemId: '01J...',
        format: 'linkedin',
        tone: 'professional',
        languages: ['vi', 'en'],
      },
    },
  })
  generate(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: Record<string, unknown>,
  ) {
    return this.ai.generatePosts(user.userId, body);
  }

  /**
   * Narrow write path into `ai.content_posts`. This is one of the
   * documented mutation surfaces the backend DB role has grant on.
   * We don't proxy to FastAPI because this is a plain UI action.
   */
  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update a post\'s workflow status',
    description:
      'Transitions a post between workflow states (draft → approved → published, etc). Writes an audit log entry.',
  })
  @ApiParam({ name: 'id', description: 'Content post ID (UUID).' })
  async updateStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    const existing = await this.prisma.contentPost.findFirst({
      where: { id, createdBy: user.userId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Post not found');

    const [updated] = await this.prisma.$transaction([
      this.prisma.contentPost.update({
        where: { id },
        data: { status: dto.status as ContentStatus, updatedAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: user.userId,
          action: 'post.status.update',
          resource: 'content_post',
          resourceId: id,
          metadata: { newStatus: dto.status },
        },
      }),
    ]);
    return updated;
  }
}
