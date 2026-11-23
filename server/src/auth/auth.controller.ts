import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthService, AuthedMember } from './auth.service';
import { DeviceGuard, CurrentMember } from './device.guard';
import { PrismaService } from '../prisma/prisma.service';

class InitializeDto {
  @IsString() @MinLength(1) @MaxLength(30)
  familyName: string;
  @IsString() @MinLength(1) @MaxLength(30)
  adminName: string;
}

class BindDeviceDto {
  @IsString() @MinLength(6) @MaxLength(6)
  familyCode: string;
  @IsString() @MinLength(1) @MaxLength(30)
  memberName: string;
  @IsOptional() @IsString() @MaxLength(50)
  deviceName?: string; // 可不传，服务端按 UA 自动命名
}

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    @Inject(PrismaService) private prisma: PrismaService,
  ) {}

  // 是否已初始化（前端决定显示"初始化引导"还是"输家庭码绑定"）
  @Get('status')
  async status() {
    const count = await this.prisma.family.count();
    return { initialized: count > 0 };
  }

  // 首次初始化：设置家庭名 + 管理员昵称，返回一次性展示的家庭码
  @Post('initialize')
  @HttpCode(201)
  async initialize(@Body() dto: InitializeDto) {
    return this.auth.initialize(dto.familyName, dto.adminName);
  }

  // 设备绑定：输家庭码 + 昵称 → 签发设备令牌
  @Post('bind')
  @HttpCode(200)
  async bind(@Body() dto: BindDeviceDto, @Req() req: { headers: Record<string, unknown> }) {
    const ua = String(req.headers['user-agent'] || '');
    return this.auth.bindDevice(dto.familyCode, dto.memberName, dto.deviceName, ua);
  }

  // 令牌自检（前端启动时验证本地令牌是否有效）
  @Get('me')
  @UseGuards(DeviceGuard)
  me(@CurrentMember() m: AuthedMember) {
    return { memberId: m.memberId, familyId: m.familyId, role: m.role };
  }

  // 管理员：重置家庭码
  @Post('reset-code')
  @UseGuards(DeviceGuard)
  async resetCode(@CurrentMember() m: AuthedMember) {
    return this.auth.resetFamilyCode(m);
  }

  // 管理员：撤销设备
  @Post('revoke-device')
  @UseGuards(DeviceGuard)
  async revoke(@CurrentMember() m: AuthedMember, @Body() b: { deviceId: string }) {
    return this.auth.revokeDevice(m, b.deviceId);
  }
}
