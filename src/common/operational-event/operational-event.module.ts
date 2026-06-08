import { Global, Module } from '@nestjs/common';
import { OperationalEventService } from './operational-event.service';

@Global()
@Module({
  providers: [OperationalEventService],
  exports: [OperationalEventService],
})
export class OperationalEventModule {}
