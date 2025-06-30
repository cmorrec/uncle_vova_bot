import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('/api')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/wakeup')
  wakeup() {
    // console.log('obtain wakeup');
    return this.appService.wakeUpChat();
  }
}
