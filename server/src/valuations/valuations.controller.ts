import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthedMember } from '../auth/auth.service';
import { CurrentMember, DeviceGuard } from '../auth/device.guard';
import {
  CreateValuationDto,
  ValuationsService,
} from './valuations.service';

@Controller('valuations')
@UseGuards(DeviceGuard)
export class ValuationsController {
  constructor(private valuations: ValuationsService) {}

  @Post()
  create(@CurrentMember() m: AuthedMember, @Body() dto: CreateValuationDto) {
    return this.valuations.create(m, dto);
  }

  @Get()
  list(@CurrentMember() m: AuthedMember) {
    return this.valuations.list(m);
  }

  @Delete(':id')
  remove(@CurrentMember() m: AuthedMember, @Param('id') id: string) {
    return this.valuations.remove(m, id);
  }
}
