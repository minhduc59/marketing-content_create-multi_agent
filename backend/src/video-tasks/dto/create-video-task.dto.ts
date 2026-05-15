import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

export class CreateVideoTaskDto {
  @ApiProperty({ enum: ['url', 'upload'], example: 'url' })
  @IsIn(['url', 'upload'])
  sourceType!: 'url' | 'upload';

  @ApiProperty({
    description: 'YouTube URL (sourceType=url) or Cloudinary public_id (sourceType=upload)',
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  })
  @IsString()
  sourceRef!: string;

  @ApiPropertyOptional({ description: 'BrandFont UUID to use for captions' })
  @IsOptional()
  @IsUUID()
  fontId?: string;

  @ApiPropertyOptional({ description: 'CaptionTemplate UUID' })
  @IsOptional()
  @IsUUID()
  captionTemplateId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, default: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxClips?: number;

  @ApiPropertyOptional({ description: 'Link to an existing ScanRun for analytics' })
  @IsOptional()
  @IsUUID()
  scanRunId?: string;
}
