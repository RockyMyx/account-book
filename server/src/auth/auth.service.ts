import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

// 设备令牌：JWT 载荷 { deviceId }，配合 Device 表的 tokenHash 做可撤销校验
// （JWT 本身无法撤销，撤销靠查表；哈希存库避免拖库后令牌直接可用）

export class AuthedMember {
  memberId: string;
  familyId: string;
  role: string;
  deviceId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  // ---------- 首次初始化 ----------
  // 只允许一次：已有家庭后再调用会报错
  async initialize(familyName: string, adminName: string) {
    const count = await this.prisma.family.count();
    if (count > 0) throw new BadRequestException('家庭空间已初始化，不能重复执行');

    const familyCode = this.configuredFamilyCode() ?? randomInt(100000, 1000000).toString();
    const family = await this.prisma.family.create({
      data: { name: familyName, familyCode },
    });

    const admin = await this.prisma.member.create({
      data: { name: adminName, role: 'admin', familyId: family.id },
    });

    return {
      familyName: family.name,
      familyCode, // 仅此一次完整返回；之后管理员可重置（重置后旧码作废）
      admin: { id: admin.id, name: admin.name },
    };
  }

  // ---------- 设备绑定（家人输家庭码 + 昵称） ----------
  async bindDevice(familyCode: string, memberName: string, deviceName: string | undefined, ua?: string) {
    const family = await this.prisma.family.findFirst({
      where: { familyCode },
    });
    if (!family) throw new UnauthorizedException('家庭码不正确');

    // 同名成员视为同一人换设备/换浏览器，绑定到既有成员
    let member = await this.prisma.member.findFirst({
      where: { familyId: family.id, name: memberName, status: 'active' },
    });
    if (!member) {
      // 家庭还没有任何成员时，首个登录者自动成为管理员（个人用清空成员后重新初始化）
      const memberCount = await this.prisma.member.count({ where: { familyId: family.id } });
      member = await this.prisma.member.create({
        data: {
          name: memberName,
          familyId: family.id,
          role: memberCount === 0 ? 'admin' : 'member',
        },
      });
    }

    // 设备名：优先前端传的；没传则按 UA 生成可读名（Chrome · Windows / Safari · iPhone）
    const name = deviceName?.trim() || this.deviceNameFromUa(ua || '');
    // 手机/电脑判定：主要看 UA（前端自定义设备名不可靠），名字仅作兜底
    const isMobile = this.isMobileDevice(name, ua || '');

    const rawToken = randomBytes(32).toString('hex');
    const ttlDays = Number(process.env.DEVICE_TOKEN_TTL_DAYS) || 180;
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 3600 * 1000);

    // 同名设备视为同一台机器（重绑/换令牌）：撤销旧记录再建新的，不堆积
    await this.prisma.device.updateMany({
      where: { memberId: member.id, deviceName: name, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const device = await this.prisma.device.create({
      data: {
        memberId: member.id,
        deviceName: name,
        isMobile,
        tokenHash: this.hash(rawToken),
        expiresAt,
      },
    });

    const jwtToken = await this.jwt.signAsync({
      deviceId: device.id,
      memberId: member.id,
    });

    return {
      token: jwtToken,
      member: { id: member.id, name: member.name, role: member.role },
      family: { id: family.id, name: family.name },
      expiresAt,
    };
  }

  // UA → 人类可读设备名
  private deviceNameFromUa(ua: string): string {
    let browser = '浏览器';
    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
    else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';
    else if (/MicroMessenger/i.test(ua)) browser = '微信';
    else if (/DingTalk/i.test(ua)) browser = '钉钉';

    let os = '设备';
    if (/Windows/i.test(ua)) os = 'Windows';
    else if (/iPhone/i.test(ua)) os = 'iPhone';
    else if (/iPad/i.test(ua)) os = 'iPad';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/Mac OS X/i.test(ua)) os = 'Mac';

    return `${browser} · ${os}`;
  }

  // 手机判定：优先看 UA 里的移动平台特征（自定义设备名不可靠），兜底看名字
  private isMobileDevice(name: string, ua: string): boolean {
    // 桌面版微信也带 MicroMessenger，先排除，避免把电脑误判为手机
    const desktopWechat = /MicroMessenger/i.test(ua) && /(Windows NT|Mac OS X)/i.test(ua);
    if (!desktopWechat && /iPhone|iPad|iPod|Android|Mobile|Windows Phone|MicroMessenger/i.test(ua)) {
      return true;
    }
    return /iPhone|iPad|Android/i.test(name);
  }

  // ---------- 令牌校验（每个请求） ----------
  async validate(token: string): Promise<AuthedMember> {
    let payload: { deviceId?: string; memberId?: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('设备令牌无效或已过期');
    }
    if (!payload.deviceId || !payload.memberId) {
      throw new UnauthorizedException('设备令牌格式错误');
    }

    const device = await this.prisma.device.findUnique({
      where: { id: payload.deviceId },
      include: { member: true },
    });
    if (!device || device.revokedAt || device.expiresAt < new Date()) {
      throw new UnauthorizedException('设备已解绑或令牌过期，请重新输入家庭码');
    }
    if (device.memberId !== payload.memberId || device.member.status !== 'active') {
      throw new UnauthorizedException('成员已移除');
    }

    // 活跃自动续期：距过期不足一半时静默延长
    // 续期按固定 TTL 算，不再用 expiresAt - lastSeenAt（电脑不更新 lastSeenAt，那样会算出错误 TTL）
    const ttlMs = (Number(process.env.DEVICE_TOKEN_TTL_DAYS) || 180) * 24 * 3600 * 1000;
    if (device.expiresAt.getTime() - Date.now() < ttlMs / 2) {
      await this.prisma.device.update({
        where: { id: device.id },
        data: { expiresAt: new Date(Date.now() + ttlMs) },
      });
    }
    // 仅手机记录最近使用时间；电脑（多为开发测试）不记
    if (device.isMobile) {
      await this.prisma.device.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date() },
      });
    }

    return {
      memberId: device.memberId,
      familyId: device.member.familyId,
      role: device.member.role,
      deviceId: device.id,
    };
  }

  // ---------- 管理员：撤销设备 / 重置家庭码 ----------
  async revokeDevice(operator: AuthedMember, deviceId: string) {
    await this.requireAdmin(operator);
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('设备不存在');
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async resetFamilyCode(operator: AuthedMember) {
    await this.requireAdmin(operator);
    const familyCode = this.configuredFamilyCode() ?? randomInt(100000, 1000000).toString();
    await this.prisma.family.update({
      where: { id: operator.familyId },
      data: { familyCode, codeResetAt: new Date() },
    });
    return { familyCode }; // 仅管理员可见新码
  }

  // 固定家庭码：配置 FAMILY_CODE 后，初始化与重置都用它（个人使用不必每次随机）
  // 未配置或格式不对（非 6 位数字）则返回 null，回退到随机生成
  private configuredFamilyCode(): string | null {
    const code = process.env.FAMILY_CODE?.trim();
    return code && /^\d{6}$/.test(code) ? code : null;
  }

  async requireAdmin(m: AuthedMember) {
    if (m.role !== 'admin') throw new ForbiddenException('仅管理员可操作');
  }

  private hash(raw: string) {
    return createHash('sha256').update(raw).digest('hex');
  }
}
