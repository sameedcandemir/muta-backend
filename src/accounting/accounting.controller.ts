import { Body, Controller, Get, Post } from '@nestjs/common';
import { AccountingService } from './accounting.service';

@Controller('accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Get('summary')
  getSummary() {
    return this.accountingService.getSummary();
  }

  @Post('entries')
  createEntry(
    @Body()
    body: { type?: string; amount?: number | string; description?: string },
  ) {
    return this.accountingService.createEntry(body);
  }
}
