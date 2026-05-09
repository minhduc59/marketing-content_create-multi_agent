import { Module } from '@nestjs/common';
import { PublisherModule } from '../publisher/publisher.module';
import { PublishController } from './publish.controller';

@Module({
  imports: [PublisherModule],
  controllers: [PublishController],
})
export class PublishModule {}
