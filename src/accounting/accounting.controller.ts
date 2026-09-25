import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AccountingService } from './accounting.service';

type EntryBody = { type?: string; amount?: number | string; currency?: string; description?: string };

@Controller('accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  // period: today | month | all
  @Get('summary')
  getSummary(@Query('period') period?: string) {
    return this.accountingService.getSummary(period);
  }

  @Post('entries')
  createEntry(@Body() body: EntryBody) {
    return this.accountingService.createEntry(body);
  }

  @Patch('entries/:id')
  updateEntry(@Param('id') id: string, @Body() body: EntryBody) {
    return this.accountingService.updateEntry(Number(id), body);
  }

  @Delete('entries/:id')
  deleteEntry(@Param('id') id: string) {
    return this.accountingService.deleteEntry(Number(id));
  }

  @Post('reset')
  reset(@Body('password') password?: string) {
    return this.accountingService.reset(password);
  }
}
