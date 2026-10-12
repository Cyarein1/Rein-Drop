import { Module } from '@nestjs/common';
import { WaitlistController } from './waitlist.controller.js';
import { WaitlistService } from './waitlist.service.js';

/** Early-access waitlist (Landing 19): one public write, owns WaitlistSignup. No reads. */
@Module({
  controllers: [WaitlistController],
  providers: [WaitlistService],
})
export class WaitlistModule {}
