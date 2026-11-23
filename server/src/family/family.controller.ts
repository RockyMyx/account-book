import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthedMember } from '../auth/auth.service';
import { CurrentMember, DeviceGuard } from '../auth/device.guard';
import { FamilyService } from './family.service';

class SetRoleDto {
  @IsIn(['admin', 'member'])
  role!: string;
}

class ProfileDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(30)
  name?: string;
  @IsOptional() @IsString() @MaxLength(8)
  avatar?: string; // emoji
}

@Controller('family')
@UseGuards(DeviceGuard)
export class FamilyController {
  constructor(private family: FamilyService) {}

  @Get('overview')
  overview(@CurrentMember() m: AuthedMember) {
    return this.family.overview(m);
  }

  // 管理员：设置成员角色
  @Put('members/:id/role')
  setRole(
    @CurrentMember() m: AuthedMember,
    @Param('id') id: string,
    @Body() dto: SetRoleDto,
  ) {
    return this.family.setRole(m, id, dto.role);
  }

  // 管理员：移除成员
  @Delete('members/:id')
  async removeMember(@CurrentMember() m: AuthedMember, @Param('id') id: string) {
    return this.family.removeMember(m, id);
  }

  // 本人：修改基本资料（昵称/头像）
  @Put('profile')
  updateProfile(@CurrentMember() m: AuthedMember, @Body() dto: ProfileDto) {
    return this.family.updateProfile(m, dto);
  }
}
