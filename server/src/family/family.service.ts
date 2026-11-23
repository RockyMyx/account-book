import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthedMember } from '../auth/auth.service';

@Injectable()
export class FamilyService {
  constructor(private prisma: PrismaService) {}

  // 家庭概览：成员列表 + 各自绑定设备（设备带 isCurrent 标记本机）
  async overview(m: AuthedMember) {
    const family = await this.prisma.family.findUnique({
      where: { id: m.familyId },
      include: {
        members: {
          where: { status: 'active' },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
          include: {
            devices: {
              where: { revokedAt: null },
              orderBy: { lastSeenAt: 'desc' },
            },
          },
        },
      },
    });
    if (!family) throw new NotFoundException('家庭不存在');

    return {
      familyName: family.name,
      myMemberId: m.memberId,
      myRole: m.role,
      members: family.members.map((mem) => ({
        id: mem.id,
        name: mem.name,
        avatar: mem.avatar,
        role: mem.role,
        joinedAt: mem.createdAt,
        devices: mem.devices.map((d) => ({
          id: d.id,
          deviceName: d.deviceName,
          isMobile: d.isMobile,
          lastSeenAt: d.lastSeenAt,
          expiresAt: d.expiresAt,
          isCurrent: d.id === m.deviceId, // 本机标记
        })),
      })),
    };
  }

  // 管理员：移除成员（留痕不删数据；其设备令牌全部失效）
  async removeMember(operator: AuthedMember, memberId: string) {
    await this.requireAdmin(operator, '移除成员');
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member || member.familyId !== operator.familyId) {
      throw new NotFoundException('成员不存在');
    }
    if (member.role === 'admin') throw new BadRequestException('不能移除管理员自己');

    await this.prisma.$transaction([
      this.prisma.member.update({
        where: { id: memberId },
        data: { status: 'removed' },
      }),
      this.prisma.device.updateMany({
        where: { memberId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { ok: true };
  }

  // 管理员：设置成员角色（admin/member）
  async setRole(operator: AuthedMember, memberId: string, role: string) {
    await this.requireAdmin(operator, '设置角色');
    if (!['admin', 'member'].includes(role)) {
      throw new BadRequestException('角色只能是 admin 或 member');
    }
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member || member.familyId !== operator.familyId) {
      throw new NotFoundException('成员不存在');
    }
    if (member.id === operator.memberId && role !== 'admin') {
      throw new BadRequestException('不能取消自己的管理员身份');
    }
    await this.prisma.member.update({ where: { id: memberId }, data: { role } });
    return { ok: true };
  }

  // 本人：修改自己的基本资料（昵称/头像）
  async updateProfile(operator: AuthedMember, data: { name?: string; avatar?: string }) {
    if (data.name !== undefined) {
      const name = data.name?.trim();
      if (!name || name.length > 30) {
        throw new BadRequestException('昵称需 1~30 个字');
      }
      const dup = await this.prisma.member.findFirst({
        where: { familyId: operator.familyId, name, status: 'active', id: { not: operator.memberId } },
      });
      if (dup) throw new BadRequestException('这个昵称已被家人使用');
    }
    if (data.avatar && data.avatar.length > 8) {
      throw new BadRequestException('头像格式不正确');
    }
    const updated = await this.prisma.member.update({
      where: { id: operator.memberId },
      data: {
        name: data.name !== undefined ? data.name.trim() : undefined,
        avatar: data.avatar,
      },
    });
    return { id: updated.id, name: updated.name, avatar: updated.avatar };
  }

  private async requireAdmin(m: AuthedMember, action: string) {
    if (m.role !== 'admin') {
      throw new BadRequestException(`仅管理员可${action}`);
    }
  }
}
